import axios from 'axios';
import jwt from 'jsonwebtoken'
import {ethers} from 'ethers'
import { print, boxConfig, utilsInitialize, getSecret } from './utils.js';

export class CoinbaseAPI {
  private apiSIWC_Key: string;
  private apiSIWC_Secret: string;
  private apiExch_Secret: string;
  private apiExch_Passphrase: string;
  private apiExch_Key:string;
  private profileId: string;
  private allowedWithdrawAddrs: string[]

  private static _instance: CoinbaseAPI;

  private constructor(cbApiConfig: any) {
    this.apiSIWC_Key = cbApiConfig.SIWC_Key ?? '';
    this.apiSIWC_Secret = cbApiConfig.SIWC_Secret ?? '';
    this.apiExch_Secret = getSecret('cbApi') ?? '';
    this.apiExch_Passphrase = cbApiConfig.CBEX_Passphrase ?? '';
    this.apiExch_Key = cbApiConfig.CBEX_Key ?? '';
    this.profileId = 'not_initialized';
    this.allowedWithdrawAddrs = cbApiConfig.AllowedWithdrawTo.map((addr: string) => addr.toLowerCase());

    try {
      this.initialize();
    } catch (error) {
      console.error('Failed to initialize CoinbaseAPI:', error);
      process.exit();
    }
  }

  
  public static async getInstance(): Promise<CoinbaseAPI> {
    if (!CoinbaseAPI._instance) {
        await utilsInitialize;

        CoinbaseAPI._instance = new CoinbaseAPI(boxConfig.cbApi);

        }
        // Always return the stored instance
        return CoinbaseAPI._instance;
  }


  private async initialize() {
    try {
      const profileResponse:any = await this.apiCall_Exchange('/profiles')
      this.profileId = profileResponse.data[0].id
    } catch (error:any) {
      throw new Error(`Coinbase API Health Check Failed. Could not get profile. ${error.message}`);
    }
  }

  public cbEx_getNetworkLabel(chainId: bigint)
  {
    const networkLabels:any = {
        '1'         :'ethereum',
        '10'        :'optimism',
        '42161'     :'arbitrum',
        '137'       :'polygon',
        '8453'      :'base',
        '130'       :'unichain',
    }

    const returnLabel = networkLabels[chainId.toString()]
    if(returnLabel==undefined) throw new Error(`cbEx_getNetworkLabel - nothing found for ${chainId}`);

    return returnLabel
  }

  public async cbEx_EstimateWithdrawFee(currencyLabel:string,sendToAddress:string,networkLabel:string)
  {
    try
    {
        const response = await this.apiCall_Exchange(`/withdrawals/fee-estimate?currency=${currencyLabel}&crypto_address=${sendToAddress}&network=${networkLabel}`)
        return response
    }
    catch(error:any)
    {
        print('cbEx_EstimateWithdrawFee Failed')
        throw error
    }
  }

  public async cbEx_getTransferReceipt(xferType:string,xferKey:string,xferUnits:number,currencyLabel:string,networkLabel:string)
  {

        var cbResponse:any

        const isExchangeKey = (xferKey.slice(0,2)=='0x') ? false : true

        // if xfer key is an evm tx hash, then xferKey will be unknown and all we have to work w/ is the deposit txn hash
        // so in this case, pull a list of all recent transfers and iterate thru them, looking for our expected hash.
        if(!isExchangeKey)
        {
          cbResponse = await this.cbEx_getTransfers()
        }
        else
        {
          cbResponse = await this.cbEx_getTransfer(xferKey)
        }

        xferKey = xferKey.replace('0x','').toLowerCase()

        // if we have an array of xfer receipts, use it directly. if its an xfer receipt that is NOT an array, turn it into 1  length array
        // this allows func to work w/ cbex_getTransfers or cbex_getTransfer -- though recently we only use cbex_getTransfer
        const cbRecentTransfers = Array.isArray(cbResponse.data) ? cbResponse.data : [cbResponse.data];

        for(const xFer of cbRecentTransfers)
        {
            var keyToCheck = isExchangeKey ? xFer.id : (xFer.details.crypto_transaction_hash ?? 'none').replace('0x','').toLowerCase()

            if(keyToCheck == xferKey) 
            {
                const precisionDecimals = currencyLabel == 'USDC' ? 3 : currencyLabel == 'BTC' ? 8 : 5

                // use special truncation to avoid nonsense w/ rounding issues.. since CB ignores anything after a certain decimal position
                const truncateToDecimals = (num: number, decimals: number) => {
                    const strNum = num.toString();
                    const decimalIndex = strNum.indexOf('.');
                    return decimalIndex === -1 ? strNum : strNum.slice(0, decimalIndex + decimals + 1);
                };

                if(truncateToDecimals(Number(xFer.amount), precisionDecimals) != truncateToDecimals(xferUnits, precisionDecimals)) throw new Error(`cbEx_getTransferReceipt: Amount unexpected ${Number(xFer.amount)} vs ${xferUnits}`);
                // coinbase only calls it ETH, even if it receives WETH via polygon etc
                const _currencyLabel = currencyLabel.replace('WETH','ETH')
                if(xFer.currency!=_currencyLabel) throw new Error(`cbEx_getTransferReceipt: Currency unexpected ${xFer.currency} vs ${_currencyLabel}`);
                if(
                  xFer.details.network!=networkLabel
                  &&
                  xFer.details.network!='internal_pro' // randomly, they started saying this is the origin network for some reason..... but the txns still seem OK
                ) throw new Error(`cbEx_getTransferReceipt: Chain unexpected ${xFer.details.network} vs ${networkLabel}`);
                return xFer
            }
        }

  }

  public async cbEx_getCurrentBalanceUnits(currencyLabel:string)
  {
    try
    {
        const response = await this.apiCall_Exchange(`/accounts`)
        for(const wallet of response?.data)
        {
            if(wallet.currency==currencyLabel)
            {
                return Number(wallet.available)
            }
        }
        return response
    }
    catch(error:any)
    {
        print('cbEx_getCurrentBalance Failed')
        return error
    }
  }

  public async cbEx_getTransfer(cbTransferKey: string)
  {
    try
    {
        const response = await this.apiCall_Exchange(`/transfers/${cbTransferKey}`)

        if(response == undefined) throw new Error(`response undefined`)
        return response
    }
    catch(error:any)
    {
        print(`cbEx_getTransfer Failed: ${error.message}`)
        return error
    }
  }

  public async cbEx_getTransfers()
  {
    // this will get most recent 1000 transfers
    try
    {
        const response = await this.apiCall_Exchange(`/transfers`)
        return response
    }
    catch(error:any)
    {
        print('cbEx_getTransfers Failed')
        return error
    }
  }

  // CB disabled this as of mid 2025
  // public async cbEx_GetPriceFromOracle(currencyLabel:string)
  // {
  //   try
  //   {
  //       const response = await this.apiCall_Exchange(`/oracle`)
  //       //@ts-ignore
  //       return response.data.prices[currencyLabel.toUpperCase()]
  //   }
  //   catch(error:any)
  //   {
  //       print(`cbEx_GetPriceFromOracle Failed: ${error.message}`)
  //       throw error
  //   }
  // }

  public async cbEx_GetSpotUsd(currencyLabel:string)
  {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates');
    const rates = response.data.data.rates;
    const rate = rates[currencyLabel.toUpperCase()];
    if (rate) {
      return 1 / parseFloat(rate);
    } else {
      throw new Error(`Rate for ${currencyLabel} not found.`);
    }
  } catch (error:any) {
    print(`Spot USD Lookup Failed: ${error.message}`);
    throw error;
  }
  }

  public async cbEx_WithdrawToCryptoAddress(currencyLabel:string, currencySpotUsd:number | undefined, sendToAddress:string,networkLabel:string,withdrawUnits:number,sendFromAddress:string,withdrawNonce:number)
  {
    try
    {
        try {
            if (currencySpotUsd === undefined) {
                currencySpotUsd = await this.cbEx_GetSpotUsd(currencyLabel);
            }
        } catch (error:any) {
            throw new Error(`cbEx_GetSpotUsd err for ${currencyLabel}: ${error.message}`);
        }

        const expectedFeeUnits:any = await this.cbEx_EstimateWithdrawFee(currencyLabel, sendToAddress, networkLabel)
        if(expectedFeeUnits==undefined) throw new Error('Failed to retrieve expected fee units')
        const expectedFeeUSD = expectedFeeUnits.data.fee * currencySpotUsd

        var maxFeeUSD = networkLabel == 'ethereum' ? 10 : 2
        if(expectedFeeUSD>maxFeeUSD)
        {
            print(`cbEx Withdraw ${networkLabel} ${currencyLabel} - Fee too high @ $${expectedFeeUSD.toFixed(2)} vs $${maxFeeUSD.toFixed(2)}`)
            return
        }

        const missingFields = [];
        if (!currencyLabel) missingFields.push('currencyLabel');
        if (!currencySpotUsd) missingFields.push('currencySpotUsd');
        if (!sendToAddress) missingFields.push('sendToAddress');
        if (!networkLabel) missingFields.push('networkLabel');
        if (!withdrawUnits) missingFields.push('withdrawUnits');
        if (!sendFromAddress) missingFields.push('sendFromAddress');
        if (!withdrawNonce) missingFields.push('withdrawNonce');

        if (missingFields.length > 0) {
            throw new Error(`cbEx Withdraw - Missing parameters: ${missingFields.join(', ')}`);
        }

        var requestPayload:any = {
            profile_id: this.profileId,
            currency: currencyLabel,
            amount: withdrawUnits.toString(),
            crypto_address: sendToAddress,
            no_destination_tag: true,
            nonce: withdrawNonce,
            network: networkLabel,
            is_intermediary: false,
            intermediary_jurisdiction: 'US',
            travel_rule_data: 
            {
                originator_name: 'Logica Labs LLC',
                transfer_purpose: 'Rebalance',
                beneficiary_name: 'Logica Labs LLC',
                is_self: true,
                originator_wallet_address: sendFromAddress
            }
        }

        if(!this.allowedWithdrawAddrs.includes(sendToAddress.toLowerCase()))
        {
            print('⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ cbEx unrecognized withdraw address')
            return
        }

        const response:any = await this.apiCall_Exchange(`/withdrawals/crypto`, requestPayload)
        if(response.data.fee==undefined)
        {
            throw new Error('cbEx_WithdrawToCryptoAddress appears failed. Nonce already used?')
        }

        if(response.data.fee!=undefined) 
        {
            response.data.expectedFeeUSD = expectedFeeUSD
            response.data.feeUSD = response.data.fee * currencySpotUsd
        }
        return response
    }
    catch(error:any)
    {
        print('cbEx_WithdrawToCryptoAddress Failed')
        throw error
    }
  }

  public async apiCall_Exchange(requestPath:string, body_json:any = '')
  {
    const timeResponse = await axios.get('https://api.exchange.coinbase.com/time');

    if(timeResponse?.data?.epoch==undefined) throw new Error(`apiCall_Exchange: response epoch empty`)

    const cb_access_timestamp = timeResponse.data.epoch.toString();

    var method = body_json=='' ? 'GET' : 'POST'

    const body = body_json=='' ? '' : JSON.stringify(body_json)

// create the prehash string by concatenating required parts
var message = cb_access_timestamp + method + requestPath + body;

// decode the base64 secret
var key = Buffer.from(this.apiExch_Secret, 'base64');

// create a sha256 hmac with the secret
var hmac = ethers.utils.computeHmac(ethers.utils.SupportedAlgorithm.sha256, key, ethers.utils.toUtf8Bytes(message));

var cb_access_sign = ethers.utils.base64.encode(hmac);

let axConfig:any = {
    method: method,
    url: `https://api.exchange.coinbase.com${requestPath}`,
    headers: { 
      'Content-Type': 'application/json',
      'CB-ACCESS-KEY': this.apiExch_Key,
      'CB-ACCESS-SIGN': cb_access_sign,
      'CB-ACCESS-TIMESTAMP': cb_access_timestamp,
      'CB-ACCESS-PASSPHRASE': this.apiExch_Passphrase
    }
  };

  if(body_json!='') axConfig.data=body_json

    // CURL can be useful for debugging when needed
    let curlCommand = `curl -X ${axConfig.method} '${axConfig.url}'`;
    for (let header in axConfig.headers) {
      curlCommand += ` -H '${header}: ${axConfig.headers[header]}'`;
    }
    //console.log(curlCommand);

  try {
    const response = await axios(axConfig);
    // console.log(JSON.stringify(response.data));
    return response;
  } catch (error:any) {
        print(`CbEx ${requestPath} Fail: ${error.response?.status ?? '[Status Unknown]'} ${error.response?.data?.message ?? error.message}`)
  }

}

// this is for "Sign-in-with-coinbase" API mode which insanely only allows sending funds to Mainnet & has no support for specifying a network (what in the everloving fuck)
 private async apiCall_siwc(request_path:string)
 {
    const key_name = this.apiSIWC_Key;
    const key_secret = this.apiSIWC_Secret;
    const request_method = 'GET';
    const url = 'api.coinbase.com';
    request_path = request_path.replace(":account_id", 'a9b4ee63-7206-5e14-a60b-984d70399d7a');
    
    const algorithm = 'ES256';
    const uri = request_method + ' ' + url + request_path;
    
    const token = jwt.sign(
            {
                iss: 'coinbase-cloud',
                nbf: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 120,
                sub: key_name,
                uri,
                kid: key_name,
                nonce: Math.floor(Math.random() * Math.pow(16, 16)).toString(16),
            },
            key_secret,
            {
                algorithm
            }
    );

    // helps w/ GET request testing as needed: Generate and print the corresponding CURL statement
    const curlCommand = `curl -X GET -H "Authorization: Bearer ${token}" https://api.coinbase.com/${request_path}`;
    
    // Make the HTTP request
    try {
        const response = await axios({
        method: 'get',
        url: `https://api.coinbase.com${request_path}`,
        headers: {
            'Authorization': `Bearer ${token}`
        }
        });

        return response
    } catch (error) {
        console.error(error);
    }    
}

}

