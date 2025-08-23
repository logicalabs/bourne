import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { sqlRead } from "../utils";
import { formatUnits } from "viem";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

const safeFormatUnits = (value: any, decimals: number) => {
    try {
        return formatUnits(value, decimals);
    } catch {
        return undefined;
    }
};

app.get("/estimate", async (c) => {
    const origChainId = c.req.query("origChainId");
    const destChainId = c.req.query("destChainId");
    const assetAddress = c.req.query("assetAddress");
    const amount = c.req.query("amount");

    if (!destChainId || !assetAddress || !amount) {
        throw new Error("Parameters 'origChainId', 'destChainId', 'assetAddress', and 'amount' are required.");
    }

    const tokenQuery = `
        SELECT *,
            CEIL(${amount} * (tokengroup_fee_capital_bps / 10000)) AS fee_capital_raw,
            CASE WHEN ${amount} >= tokengroup_fee_service_raw * 2 THEN tokengroup_fee_service_raw ELSE 0 END AS fee_service_raw,
        FROM tokens
            join token_groups using (tokengroup)
        WHERE tokenaddress = '${assetAddress}' AND tokenchainid = ${origChainId}
    `;
    const tokenInfo = await sqlRead(tokenQuery);

    if (!tokenInfo.length) {
        throw new Error("Asset information not found for the given asset address and origin chain ID.");
    }

    const estimation = {
        fees: {
            capital: {
                bps: tokenInfo.tokengroup_fee_capital_bps, 
                raw: tokenInfo.fee_capital_raw, 
                units: safeFormatUnits(tokenInfo.fee_capital_raw, tokenInfo.tokendecimals),
                is_estimate: false,
            },
            service: {
                raw: tokenInfo.fee_service_raw,
                units: safeFormatUnits(tokenInfo.fee_service_raw, tokenInfo.tokendecimals),
                is_estimate: false,
            },
            exchange: {
                raw: "1",
                units: safeFormatUnits("1", tokenInfo.tokendecimals),
                is_estimate: true,
            },
            dest_gas: {
                raw: "1",
                units: safeFormatUnits("1", tokenInfo.tokendecimals),
                is_estimate: true,
            },
        },
        pricing: {
            dest_gas_price_gwei: 5
        },
        params: {
            origChainId,
            destChainId,
            assetAddress,
            amount,
        },
    };

    return c.json(estimation);
});


app.get("/transfers", async (c) => {
    const depositor = c.req.query("depositor")?.toLowerCase();
    const hash = c.req.query("hash");

    if ((depositor && hash) || (!depositor && !hash)) {
        throw new Error("Either 'depositor' or 'hash' parameter must be supplied.");
    }

    let query = `
        SELECT *
        FROM latest_boxbridge_events
        JOIN boxbridges USING (proxy_contract, origin_chain_id, deposit_id)
        JOIN bourne.proxy_transfers pt USING (proxy_contract, origin_chain_id, deposit_id)
        JOIN bourne.tx ON txhash_deposit = txhash
        JOIN tokens ON tokens.tokenaddress = pt.asset_address AND tokens.tokenchainid = origin_chain_id
        JOIN token_groups USING (tokengroup)
    `;

    if (depositor) {
        query += ` WHERE LOWER(tx.txfrom) = '${depositor}'`;
    } else if (hash) {
        query += ` WHERE pt.txhash_deposit = '${hash}' OR pt.txhash_withdraw = '${hash}' OR boxbridges.exchange_withdraw_hash = '${hash}' OR boxbridges.contract_withdraw_hash = '${hash}'`;
    }

    query += ` ORDER BY transfer_ts DESC`;

    const result = await sqlRead(query);

    const response = result.map((row:any) => ({
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
            utc: new Date(row.deposit_ts * 1000).toISOString(),
            raw: row.deposit_amount_raw, units: safeFormatUnits(row.deposit_amount_raw, row.tokendecimals),
            depositor: row.txfrom,
            hash: row.txhash_deposit,
        },
        transfer_fees: {
            capital: {bps: row.fee_capital_bps ?? 0, raw: row.fee_capital_raw ?? "0", units: safeFormatUnits(row.fee_capital_raw, row.tokendecimals) ?? "0"},
            service: {raw: row.fee_service_raw ?? "0", units: safeFormatUnits(row.fee_service_raw, row.tokendecimals) ?? "0"},
            exchange: {raw: row.fee_exchange_raw ?? "0", units: safeFormatUnits(row.fee_exchange_raw, row.tokendecimals) ?? "0"},
            dest_gas: {raw: row.fee_destgas_raw ?? "0", units: safeFormatUnits(row.fee_destgas_raw, row.tokendecimals) ?? "0"},
        },
        received: {
            utc: new Date(row.withdraw_ts * 1000).toISOString(),
            raw: row.withdraw_amount_raw, 
            units: safeFormatUnits(row.withdraw_amount_raw, row.tokendecimals),
            recipient: row.recipient_address,
            hash: row.txhash_withdraw,
        },
        sys:
            {
                proxy_contract: row.proxy_contract,
                deposit_id: row.deposit_id,
            }
        }

    ));

    const filteredResponse = response.map((entry: any) => {
        if (!entry.received.hash || !entry.received.raw) {
            const { received, transfer_fees, ...rest } = entry;
            return rest;
        }
        return entry;
    });

    return c.json(filteredResponse);
  }); 

export default app;
