
import express from 'express';
import cors from 'cors'; 
import { sqlRead, print, safeSql } from "./utils"; 
import { formatUnits } from "viem";
import { CoinbaseAPI } from "./coinbase.js"
import { vChainManager } from './vchains';

const safeFormatUnits = (value:any, decimals:number) => {
    try {
        // viem's formatUnits expects value to be a BigInt for raw units
        // or a string that can be parsed as a BigInt.
        if (value === null || typeof value === 'undefined') {
            return undefined;
        }
        // Ensure the value is converted to BigInt if it's a string, or directly used if already BigInt/Number
        const valueAsBigInt = typeof value === 'string' ? BigInt(value) : BigInt(value);
        return formatUnits(valueAsBigInt, decimals);
    } catch (e) {
        console.error(`Error formatting units for value: ${value}, decimals: ${decimals}`, e);
        return undefined;
    }
};

const app = express() as express.Application;
app.use(express.json()); // Enable JSON body parsing
app.use(cors()); // Enable CORS for all routes

// Endpoint for estimating fees and pricing
app.get("/estimate", async (req:any, res:any) => {
    
    const cbAPI = await CoinbaseAPI.getInstance()

    const vchains = await vChainManager.getInstance();

    // Access query parameters from req.query directly for Express
    const { orig_chain_id, dest_chain_id, asset_address, amount } = req.query;

    if (!orig_chain_id || !dest_chain_id || !asset_address || !amount) {
        return res.status(400).json({ error: "Parameters 'orig_chain_id', 'dest_chain_id', 'asset_address', and 'amount' are required." });
    }

    // Construct the SQL query. Confirming that token exists on orig *and* dest
    // TODO: make this actually pull the orig vs dest token info & use that downstream
    // rihgt now we assume the address / decimals are identical, which just happens to be true w/ the tokens supported right now
    const tokenQuery = safeSql`
        SELECT tokens.*
            ,token_groups.tokengroup_fee_capital_bps
            ,token_groups.tokengroup_fee_service_raw
            ,token_groups.coinbase_symbol
            ,token_groups.proxy_xfer_min_units
            ,token_groups.proxy_xfer_max_units
            ,CEIL(${amount} * (tokengroup_fee_capital_bps / 10000)) AS fee_capital_raw
            ,CASE WHEN ${amount} >= tokengroup_fee_service_raw * 2 THEN tokengroup_fee_service_raw ELSE 0 END AS fee_service_raw
        FROM tokens
            join tokens jdesttoken on
                jdesttoken.tokengroup = tokens.tokengroup
                and
                jdesttoken.tokenchainid = ${dest_chain_id}
            JOIN token_groups on 
                tokens.tokengroup = token_groups.tokengroup
        WHERE tokens.tokenaddress = ${asset_address} AND tokens.tokenchainid = ${orig_chain_id}
        and ${orig_chain_id}<>${dest_chain_id}
    `;

    const tokenInfoResult = await sqlRead(tokenQuery);

    if (!tokenInfoResult || !tokenInfoResult.length) { // Added check for tokenInfoResult being null/undefined
        return res.status(404).json({ error: "Route not found. Check the asset address, orig chain id, and dest chain id." });
    }

    if (tokenInfoResult.length > 1) {
        return res.status(500).json({ error: "Server error. Ambiguous config settings." });
    }

    const row = tokenInfoResult[0]

    // get cb withdraw fee estimate
    const cbFeeData = await cbAPI.cbEx_EstimateWithdrawFee(
        row.coinbase_symbol, 
        asset_address, // "send to" address doesnt matter much. we're just getting an estimate
        cbAPI.cbEx_getNetworkLabel(dest_chain_id)
    );

    if (cbFeeData?.data?.fee === undefined) throw new Error('cbEx_EstimateWithdrawFee failed: no fee data returned');

    const cbFeeUnits = Number(cbFeeData?.data?.fee)

    const destChain = vchains[dest_chain_id]

    var destChainGasPriceWei

    try {
        destChainGasPriceWei = await destChain?.cliRead.getGasPrice();

        if(destChainGasPriceWei==undefined) throw new Error(`getGasPrice returned empty`)

        // + 10%
        destChainGasPriceWei = BigInt(destChainGasPriceWei * BigInt(11) / BigInt(10))

    } catch (error:any) {
        console.error('Failed to get RPC gas price:', error);
        return res.status(500)
    }

    const depositUnits = Number(formatUnits(amount, row.tokendecimals))

    if(depositUnits<row.proxy_xfer_min_units)
    {
        return res.status(400).json({ error: `Amount too low. Minimum units: ${Number(row.proxy_xfer_min_units).toFixed(row.tokendecimals)}` });
    }

    if(depositUnits>row.proxy_xfer_max_units)
    {
        return res.status(400).json({ error: `Amount too high. Maximum units: ${Number(row.proxy_xfer_max_units).toFixed(row.tokendecimals)}` });
    }

    const routeSummary = `${depositUnits} ${row.tokengroup} from Chain${orig_chain_id} >> ${row.tokengroup} to Chain${dest_chain_id}`

    print(`%ts estimate 🧮 ${routeSummary}`)

    const estimation = {
        route_summary: routeSummary,
        fees: {
            capital: {
                bps: row.tokengroup_fee_capital_bps,
                raw: row.fee_capital_raw, // Use calculated value
                units: safeFormatUnits(row.fee_capital_raw, row.tokendecimals),
                is_estimate: false,
            },
            service: {
                raw: row.fee_service_raw, // Use calculated value
                units: safeFormatUnits(row.fee_service_raw, row.tokendecimals),
                is_estimate: false,
            },
            exchange: {
                units: cbFeeUnits.toFixed(row.tokendecimals),
                raw: BigInt(Math.ceil(cbFeeUnits * row.tokendecimalsmod)).toString(),
                is_estimate: true,
            },
            dest_gas: {
                raw: "0", // Placeholder, as in original code
                units: safeFormatUnits("0", row.tokendecimals),
                is_estimate: true,
            },
            total: {}
        },
        pricing: {},
        orig: {
            asset: {
                label: row.tokengroup,
                decimals: row.tokendecimals,
                address: row.tokenaddress,
            },
            chain: {
                id: orig_chain_id
            }
        },
        dest: {
            asset: {
                label: row.tokengroup,
                decimals: row.tokendecimals,
                address: row.tokenaddress,
            },
            chain: {
                id: dest_chain_id
            },
        },
        amount_in: {},
        amount_out_estimate: {},
        params: {
            orig_chain_id,
            dest_chain_id,
            asset_address,
            amount,
        },
    };

    const feesTotal = BigInt(estimation.fees.capital.raw) +
    BigInt(estimation.fees.service.raw) +
    BigInt(estimation.fees.exchange.raw) +
    BigInt(estimation.fees.dest_gas.raw)

    const feesTotalUnits = Number(formatUnits(feesTotal, row.tokendecimals))

    const outputUnits = Number((depositUnits - feesTotalUnits).toFixed(row.tokendecimals))

    const effectiveFeeBps = ((depositUnits - outputUnits) / depositUnits) * 10_000

    estimation.fees.total = {
        raw: feesTotal.toString(),
        units: feesTotalUnits.toString(),
        effective_total_bps: effectiveFeeBps.toFixed(5),
        is_estimate: true,
    };

    estimation.pricing = {
        dest_gas_price_gwei: formatUnits(destChainGasPriceWei, 9)
    }

    estimation.amount_in = {raw: amount, units: depositUnits.toString()}

    estimation.amount_out_estimate = {raw: BigInt(Math.ceil(outputUnits * row.tokendecimalsmod)).toString(), units: outputUnits.toString()}

    

    return res.json(estimation)
});

// Endpoint for retrieving transfer information
app.get("/transfers", async (req:any, res:any) => {
    const depositor = typeof req.query.depositor === 'string' ? req.query.depositor.toLowerCase() : undefined;
    const hash = typeof req.query.hash === 'string' ? req.query.hash : undefined;

    if ((depositor && hash) || (!depositor && !hash)) {
        return res.status(400).json({ error: "Either 'depositor' or 'hash' parameter must be supplied." });
    }

    const query = safeSql`
        SELECT *
        FROM latest_boxbridge_events
        JOIN boxbridges USING (proxy_contract, origin_chain_id, deposit_id)
        JOIN bourne.proxy_transfers pt USING (proxy_contract, origin_chain_id, deposit_id)
        JOIN bourne.tx ON txhash_deposit = txhash
        JOIN tokens ON tokens.tokenaddress = pt.asset_address AND tokens.tokenchainid = origin_chain_id
        JOIN token_groups USING (tokengroup)
        ${depositor ? `WHERE LOWER(tx.txfrom) = '${depositor}'` : `WHERE pt.txhash_deposit = '${hash}' OR pt.txhash_withdraw = '${hash}' OR boxbridges.exchange_withdraw_hash = '${hash}' OR boxbridges.contract_withdraw_hash = '${hash}'`}
        ORDER BY transfer_ts DESC
    `;

    const result = await sqlRead(query);

    // Ensure result is an array before mapping
    if (!Array.isArray(result)) {
        console.error("sqlRead did not return an array for transfers query:", result);
        return res.status(500).json({ error: "Unexpected database response." });
    }

    const response = result.map((row) => ({
        route_summary: `${safeFormatUnits(row.deposit_amount_raw, row.tokendecimals)} ${row.tokengroup} from Chain${row.origin_chain_id} >> ${row.tokengroup} to Chain${row.destination_chain_id}`,
        orig: {
            asset: {
                label: row.tokengroup,
                decimals: row.tokendecimals,
                address: row.asset_address,
            },
            chain: {
                id: row.origin_chain_id
            }
        },
        dest: {
            asset: {
                label: row.tokengroup,
                decimals: row.tokendecimals,
                address: row.asset_address,
            },
            chain: {
                id: row.destination_chain_id
            },
        },
        status: {
            last_status_ts: row.event_ts,
            last_status: row.status,
            next_step: row.next_step
        },
        sent: {
            utc: row.deposit_ts ? new Date(row.deposit_ts * 1000).toISOString() : null,
            raw: row.deposit_amount_raw,
            units: safeFormatUnits(row.deposit_amount_raw, row.tokendecimals),
            depositor: row.txfrom,
            hash: row.txhash_deposit,
        },
        transfer_fees: {
            capital: {
                bps: row.fee_capital_bps ?? 0,
                raw: row.fee_capital_raw ?? "0",
                units: safeFormatUnits(row.fee_capital_raw, row.tokendecimals) ?? "0"
            },
            service: {
                raw: row.fee_service_raw ?? "0",
                units: safeFormatUnits(row.fee_service_raw, row.tokendecimals) ?? "0"
            },
            exchange: {
                raw: row.fee_exchange_raw ?? "0",
                units: safeFormatUnits(row.fee_exchange_raw, row.tokendecimals) ?? "0"
            },
            dest_gas: {
                raw: row.fee_destgas_raw ?? "0",
                units: safeFormatUnits(row.fee_destgas_raw, row.tokendecimals) ?? "0"
            },
        },
        received: {
            utc: row.withdraw_ts ? new Date(row.withdraw_ts * 1000).toISOString() : null,
            raw: row.withdraw_amount_raw,
            units: safeFormatUnits(row.withdraw_amount_raw, row.tokendecimals),
            recipient: row.recipient_address,
            hash: row.txhash_withdraw,
        },
        sys: {
            proxy_contract: row.proxy_contract,
            deposit_id: row.deposit_id,
        }
    }));

    const filteredResponse = response.map((entry) => {
        // Only remove 'received' and 'transfer_fees' if BOTH received.hash and received.raw are falsy
        if (!entry.received.hash || !entry.received.raw) {
            const { received, transfer_fees, ...rest } = entry;
            return rest;
        }
        return entry;
    });

    return res.json(filteredResponse);
});

// global err handler
app.use((err: any, req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === 'dev') {
        console.error(err);
        return res.status(500).json({ 
            error: "Internal server error", 
            details: err.message 
        });
    }

    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
});

export default app;
