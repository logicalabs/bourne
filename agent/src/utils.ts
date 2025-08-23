
import { NtpTimeSync } from "ntp-time-sync";
import os from 'os';
import { Client, QueryConfig, QueryResult } from 'pg';
import { vChain } from "./vchains";
import * as dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { decodeErrorResult, EstimateContractGasParameters, WriteContractParameters } from "viem";
import { boxConfigManager } from './config.js';

dotenv.config();

const timeSync = NtpTimeSync.getInstance();

let ntpOffset:number

export var ts_startUp = ntpNow()

export const hostname = os.hostname().replace('hostname', '').toUpperCase()

export var boxConfig:any

// Random string since we use this for runtime in-mem de/scrambling. nothing that needs to persist.
const XOR_KEY = Math.random().toString(36).substring(2, 15); 

export function scramble(value: string): string {
    let result = '';
    for (let i = 0; i < value.length; i++) {
        result += String.fromCharCode(value.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return result;
}

export function descramble(scrambledValue: string): string {
    let result = '';
    for (let i = 0; i < scrambledValue.length; i++) {
        result += String.fromCharCode(scrambledValue.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return result;
}

const secrets = new Map<string, string>();

export function getSecret(entityName: string): string | undefined {
  const scrambledSecret = secrets.get(entityName);
  if (scrambledSecret) {
      return descramble(scrambledSecret);
  }
  return undefined;
}

export const utilsInitialize = (async () => {
  try {
      initNTPtimeSync();

      boxConfig = await boxConfigManager.getInstance();

      for (const { Entity, KeyLabel } of boxConfig.gcpKeyRing) {
        const secret = await accessSecretVersion(KeyLabel, boxConfig.gcpKeyFilePath, boxConfig.gcpProject);
        const scrambledSecret = scramble(secret);
        secrets.set(Entity, scrambledSecret);
      }

        ts_startUp = ntpNow() ?? Date.now()

      return true;
  } catch (error:any) {
      console.error("utilsInitialize err", error);
      return false;
  }
})();

async function initNTPtimeSync()
{
for(;;)
{
    try{
    ntpOffset = (await timeSync.getTime(true)).offset ?? 0
    if(Math.abs(ntpOffset)>5000) 
        {
            print(`Unusual NTP offset value of ${ntpOffset}. Ignoring.`)
            ntpOffset = 0
        }
    }
    catch(error:any)
    {
        print(`### NTP Sync request failed. Trying again shortly. ${error.message}`)
    }
    await delay(10000)
}
}

export function selfDestructAfterDelay(minutes: number) {
  setTimeout(() => {
    print(`Uptime ${minutes} minutes. Intentionally self-destructing to enable a restart.`);
    process.exit();
  }, minutes * 60_000);
}

export function bytes32ToBytes20(input: `0x${string}`): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$|^0x[a-fA-F0-9]{64}$/.test(input)) throw new Error(`Invalid input: ${input}`);

  if (input.length === 66) 
      {
          if(input.slice(0,26)!='0x000000000000000000000000') throw new Error(`Input cannot be safely converted to bytes20: ${input}`)
          return `0x${input.slice(-40)}`;
      }
  if (input.length !== 42) throw new Error(`Invalid input length: ${input}`);
  return input;
}

export function bytes20ToBytes32(input: `0x${string}`): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$|^0x[a-fA-F0-9]{64}$/.test(input)) throw new Error(`Invalid input: ${input}`);

  if (input.length === 42) return `0x${'0'.repeat(24)}${input.slice(2)}`;
  if (input.length !== 66) throw new Error(`Invalid input length: ${input}`);
  return input;
}


export function addrAbbrev(addr: `0x${string}`): string {
  const shortened = bytes32ToBytes20(addr);
  return `${shortened.slice(0, 6)}~${shortened.slice(-4)}`;
}


export function ntpNow(): number
{
    return (Date.now()+(ntpOffset ?? 0))
}

export function tStamp(startTimeStamp = 0) {
	var timeCur = new Date().toISOString().replace('T', ' ').replace('Z', '');
	
	var timeDiff = (startTimeStamp>0) ? ` +${(Date.now() - startTimeStamp).toString().padStart(5)}ms` : ''
	
	return `${timeCur}${timeDiff} - `
	
}


const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect();

// can run a direct sql string (not injection safe) or a QueryConfig prepared via safeSql
export const sqlWrite = async (query: string | QueryConfig): Promise<any[] | undefined> => {
  try {
    // Start a transaction
    await client.query('BEGIN');

    const res: QueryResult = await client.query(query);

    // Commit the transaction
    await client.query('COMMIT');

    // Return rows if it was an INSERT command and rows exist, otherwise undefined
    return res.command === 'INSERT' && res.rows.length ? res.rows : undefined;
  } catch (err) {
    // Rollback the transaction in case of an error
    await client.query('ROLLBACK');
    console.error('SQL Write Error:', err);
    throw err; // Re-throw the error for upstream handling
  }
};

// A simple helper function to safely process template literals
export function safeSql(strings: TemplateStringsArray, ...params: any[]): QueryConfig {
  const queryParts: string[] = [];
  const values: any[] = [];

  for (let i = 0; i < strings.length; i++) {
    queryParts.push(strings[i] ?? '');
    if (i < params.length) {
      queryParts.push(`$${values.length + 1}`);
      values.push(params[i]);
    }
  }

  const queryString = queryParts.join('');

  return {
    text: queryString,
    values: values,
  };
}

export const sqlRead = async <T = any>(query: string | QueryConfig): Promise<T[]> => {
  try {
    const res = await client.query(query);
    return res.rows as T[];
  } catch (err) {
    console.error('SQL Read Error:', err);
    throw err;
  }
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const print = (message: any) => {
  const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

  if(typeof(message)=='string')
  message = message.replace(`%ts`, timestamp)

  console.log(message);
};


export async function accessSecretVersion(secretName: string, keyFileFullPath: string, gcpProject:string) {
  const client = new SecretManagerServiceClient({
    keyFilename: keyFileFullPath
  });

  const name = `projects/${gcpProject}/secrets/${secretName}/versions/latest`;

  const [version] = await client.accessSecretVersion({name});
  //@ts-ignore
  var payload = version.payload.data.toString('utf8');

payload=payload.replace('3jDTmXyF', 'jD3FyTmX') // cbExRebalACX

if(payload.substr(0,2)!='0x' && secretName.substr(0,2)=='pk') payload = `0x${payload}`

payload = payload.replaceAll('\\n', '\n') // something along the way decides that swapping my literal \n's for \\n's would be helpful. not.

  return payload;
}

// handles bigint
export function boxStringify(obj:any) {
  return JSON.stringify(obj, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
  );
}

export function BigIntMult(bigIntValue: bigint, numberValue: number): bigint {
  const safeNumber = Math.round(numberValue * 100000);
  return (bigIntValue * BigInt(safeNumber)) / BigInt(100000);
}

export function parseTxErr(error: any, ABI: any = undefined): string {
  var decodedError = undefined;
  var errorHash =
      error.cause?.data
      ?? error.cause?.cause?.data
      ?? error.cause?.cause?.cause?.data
      ?? error.cause?.cause?.cause?.cause?.data
      ?? error.cause?.cause?.cause?.cause?.cause?.data
      ?? error.cause?.cause?.cause?.cause?.cause?.cause?.data
      ?? error.cause?.cause?.cause?.cause?.cause?.cause?.cause?.data;

  try {
      if (errorHash != undefined && ABI != undefined) {
          const oDecodedError = decodeErrorResult({
              abi: ABI,
              data: errorHash
          });
          decodedError = oDecodedError?.args?.[0] ?? oDecodedError.errorName;
      }
  } catch (error: any) {
      print(`Failed to decode error hash ${errorHash}. ${error.message.substr(0, 75)}`);
  }

  if (decodedError === 'Error') decodedError = undefined;

  const errorName = error.cause?.data?.errorName === 'Error' ? undefined : error.cause?.data?.errorName;
  var outputError = decodedError ?? errorName ?? error.details ?? error.shortMessage ?? error.message ?? error.name ?? '<could not parse err msg>';

  const replacements = [
      { find: 'The contract function ', replace: '' },
      { find: ' with the following reason:', replace: '' },
      { find: '\n', replace: ' ' }
  ];

  replacements.forEach(({ find, replace }) => {
      outputError = outputError.replace(find, replace);
  });

  return outputError;
}

export async function contractSimSend(printLabel: string, chain: vChain, tx: EstimateContractGasParameters)
{
    //@ts-ignore
    if(!tx.account) tx.account = chain.cliWrite.account as Account

    // Start promises to get transactionCount (nonce) and gasPrice which will be hardened onto the tx prior to actual send
    //@ts-ignore
    const noncePromise = chain.cliRead.getTransactionCount({address: tx.account.address});
    const gasPricePromise = chain.cliRead.getGasPrice();

    try {
        const estGasUnits = await chain.cliRead.estimateContractGas(tx);
        tx.gas = BigIntMult(estGasUnits, 1.5)
        print(`${printLabel} SIM 🔮  OK`);
    } catch (error) {
        print(`${printLabel} SIM ⚠️ ERR: ${parseTxErr(error)}`);
        return;
    }

    try {
        tx.nonce = await noncePromise;
    } catch (error) {
        print(`${printLabel} ERR: Failed to load nonce`);
        return;
    }

    try {
        const rawGasPriceFromRpc = await gasPricePromise;
        
        // todo: config var?
        var gasPriceMult = 1.025;

        if(chain.id == 42161) gasPriceMult = 1.15; 

        tx.gasPrice = BigIntMult(rawGasPriceFromRpc, gasPriceMult)
 
        const safetyMult = 1.30;   
        const safetyPrice = BigIntMult(rawGasPriceFromRpc, safetyMult)

        if (safetyPrice <= tx.gasPrice) {
            print(`${printLabel} ERR: Safety price ${safetyPrice} vs tx Price ${gasPriceMult}`)
            return
        }
    
    } catch (error) {
        print(`${printLabel} ERR: Failed to load gasPrice`);
        return;
    }


    let txHash;
    try {
        txHash = await chain.cliWrite.writeContract(tx as WriteContractParameters);
        print(`${printLabel} SND 📬  OK: ${txHash}`);
    } catch (error: any) {
        print(`${printLabel} SND ⚠️ ERR: ${error.message.slice(0,200)}`);
        return;
    }

    try {
        var receipt 
        try{
          receipt = await chain.cliRead.waitForTransactionReceipt({ hash: txHash, timeout: 60_000, pollingInterval: 5_000 });
        }
        catch(error:any)
        {
          // if waitForTransactionReceipt times out, wait 10 more seconds and try one more time with a direct poll before giving up
          if(error.message.includes('Timed out')) 
            {
              await delay(15_000)
              receipt = await chain.cliRead.getTransactionReceipt({hash: txHash})
            }
            else throw new Error(error)
        }

        print(`${printLabel} SNT ${receipt.status === 'success' ? '✅  OK: ' : '❌ REV: '}${txHash}`);
        return receipt
    } catch (error: any) {
        print(`${printLabel} SNT ⚠️ ERR: ${error.message.slice(0,200)}`);
    }

}