import { boxConfig, delay, utilsInitialize, print, sqlRead, sqlWrite, boxStringify, contractSimSend, ntpNow } from "./utils";
import { CoinbaseAPI } from "./coinbase.js"
import { decodeEventLog, formatUnits } from "viem";
import { privateKeyToAccount } from 'viem/accounts';
import { vChain, vChainManager } from "./vchains";
import { abiTransferProxy } from "./abis/TransferProxy";
import { abiErc20 } from "./abis/erc20";
import app from "./api"

let cbAPI:CoinbaseAPI
let vchains:{ [key: number]: vChain }

mainFlow()

async function mainFlow()
{
    await utilsInitialize

    cbAPI = await CoinbaseAPI.getInstance()

    vchains = await vChainManager.getInstance();

    const PORT = boxConfig.bourneApiPort

    app.listen(PORT, () => {
        print(`%ts API is listening on port ${PORT}`);
    });

    for(;;)
    {
        await delay(2500)
        await sweep_boxbridges()
    }
}

async function sweep_boxbridges()
{
    
    //print(`%ts START sweep_boxbridges`)

    await sweep_step_registerNewDeposits()

    await delay(500)

    await sweep_step_checkAcknowledgements()
        
    await delay(500)

    await sweep_step_checkConfirmations()
        
    await delay(500)

    await sweep_step_requestCexWithdrawals()

    await delay(500)

    await sweep_step_confirmCexWithdrawal()

    await delay(500)
    
    await sweep_step_withdrawToRecipient()

    //print(`%ts DONE  sweep_boxbridges`)
}

const logNoiseLimiter:any = {}

async function sweep_step_registerNewDeposits()
{

        const selectQuery = `
        SELECT
            pt.proxy_contract,
            pt.origin_chain_id,
            pt.deposit_id,
            pt.amount AS deposit_amount_raw,
            pt.txhash_deposit,
            pt.deposit_ts,
            pt.destination_chain_id,
            pt.recipient_address,
            tokengroup_fee_capital_bps AS fee_capital_bps,
            CEIL(pt.amount * (tokengroup_fee_capital_bps / 10000)) AS fee_capital_raw,
            CASE WHEN pt.amount >= tokengroup_fee_service_raw * 2 THEN tokengroup_fee_service_raw ELSE 0 END AS fee_service_raw,
            tokens.*
        FROM bourne.proxy_transfers pt
        JOIN tokens ON
            tokens.tokenaddress = pt.asset_address
            AND tokens.tokenchainid = origin_chain_id
        JOIN token_groups USING (tokengroup)
        LEFT JOIN boxbridges bb
        ON pt.origin_chain_id = bb.origin_chain_id
        AND pt.deposit_id = bb.deposit_id
        WHERE bb.deposit_id IS NULL`;

    const rows = await sqlRead(selectQuery);

    for (const row of rows) {

        const depositLabel = depositInitialize(row)

        print(`%ts ${depositLabel} (${tsDiff(row.deposit_ts)}) 👀 01 Discovered by Agent - Adding to DB`);

        var insertQuery = `
            INSERT INTO boxbridges (
                proxy_contract,
                origin_chain_id,
                deposit_id,
                deposit_amount_raw,
                fee_capital_bps,
                fee_capital_raw,
                fee_service_raw
            ) VALUES (
                '${row.proxy_contract}',
                ${row.origin_chain_id},
                ${row.deposit_id},
                ${row.deposit_amount_raw},
                ${row.fee_capital_bps},
                ${row.fee_capital_raw},
                ${row.fee_service_raw}
            );`;

        insertQuery += addEventQuery(
            row.proxy_contract,
            row.origin_chain_id,
            row.deposit_id,
            'Deposit Confirmed by Agent',
            'Awaiting Acknowledgement by CEX',
            row.txhash_deposit
        );

        const result = await sqlWrite(insertQuery);

    }
}

function depositInitialize({ proxy_contract, deposit_id, origin_chain_id, destination_chain_id, asset_address, deposit_amount_raw, tokensymbol, tokendecimals, recipient_address }:any) {
    
    const assetAmountunits = Number(formatUnits(BigInt(deposit_amount_raw), tokendecimals))

    const origChain = vchains[origin_chain_id]
    const destChain = vchains[destination_chain_id]


    const depositSummary = `${assetAmountunits} ${tokensymbol} ${origChain?.name.slice(0,3).toLocaleLowerCase()}>${destChain?.name.slice(0,3).toLocaleLowerCase()} #${deposit_id.padStart(3, '0')}`

    if(deposit_amount_raw.toString=='5124') throw new Error(`Skipping test ${depositSummary}`)

    return(depositSummary)
}


function tsDiff(startTime: number, endTime: number = ntpNow()) {

    if(typeof(startTime)=='object')
    {
        try
        {
            const date = new Date(startTime);
            startTime = date.getTime();
        }
        catch(error:any)
        {
            throw new Error(`tsDiff could not convert startTime from ${startTime}`)
        }
    }

    if(typeof(endTime)=='object')
        {
            try
            {
                const date = new Date(endTime);
                endTime = date.getTime();
            }
            catch(error:any)
            {
                throw new Error(`tsDiff could not convert endTime from ${endTime}`)
            }
        }

    // asusme seconds were given & normalize to ms if timestamp is super far in the past
    if(startTime<2000000000) startTime *= 1000
    if(endTime<2000000000) endTime *= 1000

    const msDiff = (endTime - startTime) * (startTime < 1e12 ? 1000 : 1);
    const hours = Math.floor(msDiff / 3600000);
    const minutes = Math.floor((msDiff % 3600000) / 60000);
    const seconds = Math.floor((msDiff % 60000) / 1000);
    const milliseconds = msDiff % 1000;
    return `${hours.toString().padStart(2, ' ')}h ${minutes.toString().padStart(2, ' ')}m ${seconds.toString().padStart(2, ' ')}s`.padStart(10, ' ')
}


async function sweep_step_checkAcknowledgements()
{
    
    const events = await sqlRead(`
        select
                *
            from latest_boxbridge_events
                join boxbridges using (proxy_contract, origin_chain_id, deposit_id)
                JOIN bourne.proxy_transfers pt using (proxy_contract, origin_chain_id, deposit_id)
                    join tokens on
                        tokens.tokenaddress = pt.asset_address
                        and
                        tokens.tokenchainid = origin_chain_id
                    join token_groups using (tokengroup)
            where
                next_step = 'Awaiting Acknowledgement by CEX'
                and
                ignore_note is null
        `);

    for (const event of events) {
        try {

            const depositLabel = depositInitialize(event)

            const transferReceipt = await cbAPI.cbEx_getTransferReceipt(
                'deposit',
                event.event_identifier,
                Number(formatUnits(event.amount, event.tokendecimals)),
                event.tokensymbol.replace('cbBTC', 'BTC'),
                cbAPI.cbEx_getNetworkLabel(event.origin_chain_id)
            );

            // not yet on file
            if (!transferReceipt) 
            {

                if((logNoiseLimiter[`${depositLabel}cexAck`] ?? 0)<ntpNow()) 
                    {
                        print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 🕐 02 CEX Deposit: Awaiting acknowledgement...`)
                        logNoiseLimiter[`${depositLabel}cexAck`] = ntpNow()+60_000
                    }

                continue;
            }

            const updateQuery = `
                UPDATE boxbridges
                SET deposit_fkey = '${transferReceipt.id}'
                WHERE proxy_contract = '${event.proxy_contract}'
                AND origin_chain_id = ${event.origin_chain_id}
                AND deposit_id = ${event.deposit_id};
            `;

            const insertQuery = addEventQuery(
                event.proxy_contract,
                event.origin_chain_id,
                event.deposit_id,
                'Deposit Acknowledged by CEX',
                'Awaiting Confirmation by CEX',
                transferReceipt.id,
                undefined,
                { transferReceipt }
            );

            await sqlWrite(`${updateQuery} ${insertQuery}`);
                await sqlWrite(addEventQuery(
                    event.proxy_contract,
                    event.origin_chain_id,
                    event.deposit_id,
                    'Deposit Acknowledged by CEX',
                    'Awaiting Confirmation by CEX',
                    transferReceipt.id,
                    undefined,
                    { transferReceipt }
                ));

                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ☑️ 02 CEX Deposit: Acknowledged in ${tsDiff(event.event_ts)}`)

            }
         catch (error) {
            console.error(`Error processing event ${event.event_identifier}:`, error);
        }
    }

}

async function sweep_step_checkConfirmations()
{
    
    const events = await sqlRead(`
        select
                *
            from latest_boxbridge_events
                join boxbridges using (proxy_contract, origin_chain_id, deposit_id)
                JOIN bourne.proxy_transfers pt using (proxy_contract, origin_chain_id, deposit_id)
                    join tokens on
                        tokens.tokenaddress = pt.asset_address
                        and
                        tokens.tokenchainid = origin_chain_id
                    join token_groups using (tokengroup)
            where
                next_step = 'Awaiting Confirmation by CEX'
                and
                ignore_note is null
        `);

    for (const event of events) {
        try {

            const depositLabel = depositInitialize(event)

            const transferReceipt = await cbAPI.cbEx_getTransferReceipt(
                'deposit',
                event.event_identifier, // will be CEX deposit ID
                Number(formatUnits(event.amount, event.tokendecimals)),
                event.tokensymbol.replace('cbBTC', 'BTC'),
                cbAPI.cbEx_getNetworkLabel(event.origin_chain_id)
            );
            
            if (transferReceipt.completed_at) {
                await sqlWrite(addEventQuery(
                    event.proxy_contract,
                    event.origin_chain_id,
                    event.deposit_id,
                    'Deposit Confirmed by CEX',
                    'Awaiting Withdrawal Request by Agent',
                    transferReceipt.id,
                    undefined,
                    { transferReceipt }
                ));
                
                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ☑️ 03 CEX Deposit: Confirmed in ${tsDiff(event.event_ts)}`)
            }
            else
            {
                
                if((logNoiseLimiter[`${depositLabel}cexConf`] ?? 0)<ntpNow()) 
                {
                    print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 🕐 03 CEX Deposit: Awaiting confirmation...`)
                    logNoiseLimiter[`${depositLabel}cexConf`] = ntpNow()+60_000
                }
                
                continue
            }

        } catch (error) {
            console.error(`Error processing event ${event.event_identifier}:`, error);
        }
    }
}

async function sweep_step_requestCexWithdrawals()
{
    
    const events = await sqlRead(`
        select
                *
            from latest_boxbridge_events
                join boxbridges using (proxy_contract, origin_chain_id, deposit_id)
                JOIN bourne.proxy_transfers pt using (proxy_contract, origin_chain_id, deposit_id)
                    join tokens on
                        tokens.tokenaddress = pt.asset_address
                        and
                        tokens.tokenchainid = origin_chain_id
                    join token_groups using (tokengroup)
            where
                next_step = 'Awaiting Withdrawal Request by Agent'
                and
                ignore_note is null
        `);

    for (const event of events) {
        try {

            const depositLabel = depositInitialize(event)

            print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 🕐 04 CEX Withdraw: Requesting...`)

            const cbTokenSymbol = event.tokensymbol.replace('cbBTC', 'BTC')

            const cbNetworkLabel = cbAPI.cbEx_getNetworkLabel(event.origin_chain_id)

            const cbFeeData = await cbAPI.cbEx_EstimateWithdrawFee(cbTokenSymbol, event.proxy_contract, cbNetworkLabel);

            if (cbFeeData?.data?.fee === undefined) throw new Error('cbEx_EstimateWithdrawFee failed: no fee data returned');

            const amounts = {
                deposit: {
                    units: Number(formatUnits(event.deposit_amount_raw, event.tokendecimals)),
                    raw: BigInt(event.deposit_amount_raw)
                },
                fee_exchange: {
                    units: cbFeeData?.data.fee,
                    raw: BigInt(Math.ceil(cbFeeData?.data.fee * event.tokendecimalsmod))
                },
                fee_capital: {
                    units: Number(formatUnits(event.fee_capital_raw, event.tokendecimals)),
                    raw: BigInt(event.fee_capital_raw)
                },
                fee_service: {
                    units: Number(formatUnits(event.fee_service_raw, event.tokendecimals)),
                    raw: BigInt(event.fee_service_raw)
                },
                withdraw: {
                    units: 0,
                    raw: 0n
                }
            };

            amounts.withdraw = {
                raw: amounts.deposit.raw - amounts.fee_exchange.raw - amounts.fee_capital.raw - amounts.fee_service.raw,
                units: Number(formatUnits(amounts.deposit.raw - amounts.fee_exchange.raw - amounts.fee_capital.raw - amounts.fee_service.raw, event.tokendecimals))
            }

            const transferReceipt = await cbAPI.cbEx_getTransferReceipt(
                'deposit',
                event.event_identifier, // will be CEX deposit ID
                amounts.deposit.units,
                cbTokenSymbol,
                cbNetworkLabel
            );

            var errMsg = ''
            // re-confirmed that it is confirmed & should be available to withdraw
            if (!transferReceipt.completed_at) errMsg = 'CbEx transfer receipt unexpectedly not confirmed'

            const destChain = vchains[event.destination_chain_id]

            if(!destChain) throw new Error(`vChain not found for dest chain id ${event.destination_chain_id}`)

            try {
                const chainId = await destChain.cliRead.readContract({
                    abi: abiTransferProxy,
                    address: event.proxy_contract,
                    functionName: 'chainId',
                });

                if (chainId != event.destination_chain_id) {
                    throw new Error(`Chain ID mismatch: expected ${event.destination_chain_id}, got ${chainId}`);
                }
    
            } catch (error:any) {
                throw new Error(`Contract check err. Not deployed at address? : ${error.message}`);
            }

            const isRecipientAllowed = await destChain.cliRead.readContract({
                abi: abiTransferProxy,
                address: event.proxy_contract,
                functionName: 'allowedRecipients',
                args: [event.recipient_address],
            });

            if (!isRecipientAllowed) {
                throw new Error(`Recipient address ${event.recipient_address} is not allowed on destination contract`);
            }

            //semi-arbitrary deterministic # to use as nonce
            const withdrawNonce = Number(parseInt(event.proxyContract, 36) + Number(event.origin_chain_id) + Number(event.deposit_id))
            
            const withdrawResponse = await cbAPI.cbEx_WithdrawToCryptoAddress(cbTokenSymbol, undefined, event.proxy_contract, cbAPI.cbEx_getNetworkLabel(event.destination_chain_id), amounts.withdraw.units, event.proxy_contract, withdrawNonce)

            const fee_exchange_actual_raw = BigInt(Math.ceil(withdrawResponse.data.fee * event.tokendecimalsmod))
            const withdraw_amount_actual_raw = BigInt(Math.ceil(withdrawResponse.data.subtotal * event.tokendecimalsmod))

            const withdrawExchangeKey = withdrawResponse.data.id

                const updateQuery = `
                    UPDATE boxbridges
                    SET
                        fee_exchange_raw = ${fee_exchange_actual_raw},
                        withdraw_amount_raw = ${withdraw_amount_actual_raw},
                        withdraw_fkey = '${withdrawExchangeKey}'
                    WHERE
                        proxy_contract = '${event.proxy_contract}'
                        AND origin_chain_id = ${event.origin_chain_id}
                        AND deposit_id = ${event.deposit_id};
                `;

                const insertQuery = addEventQuery(
                    event.proxy_contract,
                    event.origin_chain_id,
                    event.deposit_id,
                    'Withdrawal Requested by Agent',
                    'Awaiting CEX Withdrawal Confirmation On-Chain',
                    withdrawExchangeKey,
                    undefined,
                    { withdrawResponse: withdrawResponse.data }
                );

                await sqlWrite(`${updateQuery} ${insertQuery}`);

                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ☑️ 04 CEX Withdraw: Requested in ${tsDiff(event.event_ts)}`)

        } catch (error:any) {
            console.error(`Error processing event ${event.event_identifier}:`, error);
        }
    }
}


async function sweep_step_confirmCexWithdrawal()
{
    
    const events = await sqlRead(`
        select
                *
            from latest_boxbridge_events
                join boxbridges using (proxy_contract, origin_chain_id, deposit_id)
                JOIN bourne.proxy_transfers pt using (proxy_contract, origin_chain_id, deposit_id)
                    join tokens on
                        tokens.tokenaddress = pt.asset_address
                        and
                        tokens.tokenchainid = origin_chain_id
                    join token_groups using (tokengroup)
            where
                next_step = 'Awaiting CEX Withdrawal Confirmation On-Chain'
                and
                ignore_note is null
        `);

    for (const event of events) {
        try {
            const depositLabel = depositInitialize(event)

            const transferReceipt = await cbAPI.cbEx_getTransferReceipt(
                'withdrawal',
                event.withdraw_fkey,
                // when confirming transfer amount, must add the fee back in to arrive at the total requested transfer amount
                // Note: this step is somewhat optional if it gives you trouble later... just a sanity confirmation
                Number(formatUnits(BigInt(event.withdraw_amount_raw) + BigInt(event.fee_exchange_raw), event.tokendecimals)),
                event.tokensymbol.replace('cbBTC', 'BTC'),
                cbAPI.cbEx_getNetworkLabel(event.destination_chain_id)
            );

            if (!transferReceipt.details.crypto_transaction_hash) {

                if((logNoiseLimiter[`${depositLabel}cexWdrw`] ?? 0)<ntpNow()) 
                    {
                        print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 🕐 05 CEX Withdraw: Awaiting confirmation...`)
                        logNoiseLimiter[`${depositLabel}cexWdrw`] = ntpNow()+60_000
                    }

                continue
            }

            const chain = vchains[event.destination_chain_id];
            const txReceipt = await chain?.cliRead.getTransactionReceipt({hash: transferReceipt.details.crypto_transaction_hash});

            if (!txReceipt) throw new Error('Failed to pull transaction receipt');

            let confirmedLog:any;

            // Loop through each log entry in the transaction receipt
            for (const log of txReceipt.logs) {
              try {

                const decodedLog = decodeEventLog({
                  abi: abiErc20,
                  data: log.data,
                  topics: log.topics
                });
            
                if (decodedLog.eventName === 'Transfer') {
                  const { to, value }:any = decodedLog.args;
            
                  if (
                    to.toLowerCase() === event.proxy_contract.toLowerCase() &&
                    value === BigInt(event.withdraw_amount_raw)
                  ) {
                    confirmedLog = decodedLog
                    break; // Exit the loop once a match is found
                  }
                }
              } catch (error) {

                // this is assumed to be just an unknown log event not related to ERC20 transfers... coinbase can do whatever they want within their txns & often interact with their own contracts
                // so ignore & move on...
                //console.error('Failed to decode a log entry:', log, error);
              }
            }

            if (!confirmedLog) {
                throw new Error('No matching ERC20 transfer found for confirmation');
            }
            else
            {
                const updateQuery = `
                    UPDATE boxbridges
                    SET exchange_withdraw_hash = '${txReceipt.transactionHash}'
                    WHERE proxy_contract = '${event.proxy_contract}'
                    AND origin_chain_id = ${event.origin_chain_id}
                    AND deposit_id = ${event.deposit_id};
                `;

                const insertQuery = addEventQuery(
                    event.proxy_contract,
                    event.origin_chain_id,
                    event.deposit_id,
                    'CEX Withdrawal Confirmed On-Chain',
                    'Awaiting Contract Withdrawal to Recipient',
                    txReceipt.transactionHash,
                    undefined,
                    { confirmedLog }
                );

                await sqlWrite(`${updateQuery} ${insertQuery}`);
                
                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ☑️ 05 CEX Withdraw: Confirmed in ${tsDiff(event.event_ts)}`)

            }

        }
        catch(error:any)
        {
            console.error(`confirmCexWithdrawal err: ${event.event_identifier}:`, error);
        }
    }
}

const lastChainWithdrawAttemptTs:any = {}

async function sweep_step_withdrawToRecipient()
{
    
    const events = await sqlRead(`
        select
                *
            from latest_boxbridge_events
                join boxbridges using (proxy_contract, origin_chain_id, deposit_id)
                JOIN bourne.proxy_transfers pt using (proxy_contract, origin_chain_id, deposit_id)
                    join tokens on
                        tokens.tokenaddress = pt.asset_address
                        and
                        tokens.tokenchainid = origin_chain_id
                    join token_groups using (tokengroup)
            where
                next_step = 'Awaiting Contract Withdrawal to Recipient'
                and
                ignore_note is null
        `);

    
    for (const event of events) {
        const depositLabel = depositInitialize(event)

        const destChain = vchains[event.destination_chain_id];

        if (!destChain) throw new Error('Destination chain not found');

        var txReceipt
        try
        {

            if(event.txhash_withdraw==undefined)
            {

                // sloppy method of avoiding double-spends, which would be very unlikely anyway
                // dont allow more than 1 withdraw attempt per X, per chain
                // IE: give a full 60 seconds for a prior attempt to settle before trying a new one
                if((lastChainWithdrawAttemptTs[destChain.id] ?? 0)<=ntpNow() - 60_000)

                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 🕐 06 XFer to Recipient: Requesting`)

                const writeAccount = privateKeyToAccount(boxConfig.bourneAgentPkey)

                lastChainWithdrawAttemptTs[destChain.id] = ntpNow()

                txReceipt = await contractSimSend(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) 📦 06 XFer to Recipient:`, destChain, {
                    account: writeAccount,
                    address: event.proxy_contract,
                    abi: abiTransferProxy,
                    functionName: 'withdrawToRecipient',
                    args: [
                        event.asset_address,
                        event.recipient_address,
                        event.withdraw_amount_raw,
                        event.deposit_id,
                        event.origin_chain_id
                    ]
                });
            }
            else
            {
                txReceipt = await destChain.cliRead.getTransactionReceipt({hash: event.txhash_withdraw})
            }

            if(!txReceipt) throw new Error(`XFer to Recipient - Receipt Not Found!`)
                
            if(txReceipt.status!='success')
            {

                // prevent re-try until investigation done
                const updateQuery = `
                    UPDATE boxbridges
                    SET ignore_note = 'reverted'
                    WHERE proxy_contract = '${event.proxy_contract}'
                    AND origin_chain_id = ${event.origin_chain_id}
                    AND deposit_id = ${event.deposit_id};
                `;

                const insertQuery = addEventQuery(
                    event.proxy_contract,
                    event.origin_chain_id,
                    event.deposit_id,
                    'Contract Withdrawal to Recipient Reverted',
                    'Investigating',
                    txReceipt.transactionHash,
                    undefined,
                    { txReceipt }
                );

                await sqlWrite(`${updateQuery} ${insertQuery}`);

                print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ❌ 06 Xfer to Recipient: Reverted in ${tsDiff(event.event_ts)} ❌❌❌`)
                continue
            }

            const updateQuery = `
                UPDATE boxbridges
                SET contract_withdraw_hash = '${txReceipt.transactionHash}'
                WHERE proxy_contract = '${event.proxy_contract}'
                AND origin_chain_id = ${event.origin_chain_id}
                AND deposit_id = ${event.deposit_id};
            `;

            const insertQuery = addEventQuery(
                event.proxy_contract,
                event.origin_chain_id,
                event.deposit_id,
                'Contract Withdrawal to Recipient Complete',
                '-All Steps Completed-',
                txReceipt.transactionHash,
                undefined,
                { txReceipt }
            );

            await sqlWrite(`${updateQuery} ${insertQuery}`);
            
            print(`%ts ${depositLabel} (${tsDiff(event.deposit_ts)}) ✅ 06 Xfer to Recipient: Confirmed in ${tsDiff(event.event_ts)} ✅✅✅`)

        }
        catch(error:any)
        {
            console.error(`confirmCexWithdrawal err: ${event.event_identifier}:`, error);
        }
    }
}

function addEventQuery(proxy_contract: string, origin_chain_id: number, deposit_id: number, status: string, next_step: string, event_identifier: string, note: string = '', ext: object = {}) {
    return `

        INSERT INTO boxbridge_events
        (proxy_contract, origin_chain_id, deposit_id, event_ts, status, next_step, event_identifier, note, ext)
        SELECT
            bb.proxy_contract, bb.origin_chain_id, bb.deposit_id,
            now(),
            '${status}',
            '${next_step}',
            '${event_identifier}',
            ${note ? `'${note}'` : 'NULL'},
            ${ext ? `'${boxStringify(ext)}'` : 'NULL'}
        FROM boxbridges bb
        WHERE
            bb.proxy_contract = '${proxy_contract}'
            AND bb.origin_chain_id = ${origin_chain_id}
            AND bb.deposit_id = ${deposit_id};
    `;
}



