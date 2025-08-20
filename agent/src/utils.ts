
import { NtpTimeSync } from "ntp-time-sync";
import os from 'os';
import { Client } from 'pg';
import { vChain } from "./vchains";
import * as dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { decodeErrorResult, EstimateContractGasParameters, WriteContractParameters } from "viem";

dotenv.config();

const timeSync = NtpTimeSync.getInstance();

let ntpOffset:number

export var ts_startUp = ntpNow()

export const hostname = os.hostname().replace('hostname', '').toUpperCase()


export async function initUtils(processName: string)
{
    initNTPtimeSync()

    ts_startUp = ntpNow() ?? Date.now()

    print(`%ts Process Started: ${processName}   Host: ${hostname}`)
}


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

export const sqlWrite = async (query: string) => {
  try {
    await client.query('BEGIN');
    const res = await client.query(query);
    await client.query('COMMIT');

    return res.command === 'INSERT' && res.rows.length ? res.rows : undefined;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SQL Write Error:', err);
    throw err;
  }
};

export const sqlRead = async (query: string) => {
  try {
    const res = await client.query(query);
    return res.rows;
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
        const gasPriceMult = 1.02;
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
        const receipt = await chain.cliRead.waitForTransactionReceipt({ hash: txHash, timeout: 60_000, pollingInterval: 5_000 });
        print(`${printLabel} SNT ${receipt.status === 'success' ? '✅  OK: ' : '❌ REV: '}${txHash}`);
        return receipt
    } catch (error: any) {
        print(`${printLabel} SNT ⚠️ ERR: ${error.message.slice(0,200)}`);
    }

}