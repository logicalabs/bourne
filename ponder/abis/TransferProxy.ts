export const abiTransferProxy = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "addrOwnerToAssign",
          "type": "address"
        },
        {
          "internalType": "address[]",
          "name": "addrAdmins",
          "type": "address[]"
        },
        {
          "internalType": "address[]",
          "name": "addrDepositors",
          "type": "address[]"
        },
        {
          "internalType": "address[]",
          "name": "addrAgents",
          "type": "address[]"
        },
        {
          "internalType": "address[]",
          "name": "allowedRecipientAddresses",
          "type": "address[]"
        },
        {
          "components": [
            {
              "internalType": "address",
              "name": "assetAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "depositAddress",
              "type": "address"
            }
          ],
          "internalType": "struct TransferProxy.allowedDeposit[]",
          "name": "allowedDepositsStructs",
          "type": "tuple[]"
        },
        {
          "components": [
            {
              "internalType": "address",
              "name": "assetAddress",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "destinationChainId",
              "type": "uint256"
            }
          ],
          "internalType": "struct TransferProxy.allowedDestination[]",
          "name": "allowedDestinationsStructs",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "DepositNotMapped",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "DestinationNotMapped",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InsufficientAllowance",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InsufficientBalance",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidParameter",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotAuthorized",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "Paused",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "RecipientNotMapped",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "token",
          "type": "address"
        }
      ],
      "name": "SafeERC20FailedOperation",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TransferFailed",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetAddress",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "depositAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isAllowed",
          "type": "bool"
        }
      ],
      "name": "eventAllowedDepositSet",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetAddress",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "destinationAddress",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isAllowed",
          "type": "bool"
        }
      ],
      "name": "eventAllowedDestinationSet",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipientAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isAllowed",
          "type": "bool"
        }
      ],
      "name": "eventAllowedRecipientSet",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "bool",
          "name": "isPaused",
          "type": "bool"
        }
      ],
      "name": "eventDepositsPaused",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetAddress",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "depositAddress",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipientAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint32",
          "name": "depositId",
          "type": "uint32"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "destinationChainId",
          "type": "uint256"
        }
      ],
      "name": "eventProxyTransfer",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "assetAddress",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipientAddress",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint32",
          "name": "depositId",
          "type": "uint32"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "originChainId",
          "type": "uint256"
        }
      ],
      "name": "eventWithdrawToRecipient",
      "type": "event"
    },
    {
      "stateMutability": "nonpayable",
      "type": "fallback"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "allowedDeposits",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "allowedDestinations",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "allowedRecipients",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "chainId",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "depositsPaused",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "emergencyWithdrawGas",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_tokenAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "emergencyWithdrawToken",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "getRole",
      "outputs": [
        {
          "internalType": "enum TransferProxy.Role",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_assetAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_depositAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_recipientAddress",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_destinationChainId",
          "type": "uint256"
        }
      ],
      "name": "proxyTransfer",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "roles",
      "outputs": [
        {
          "internalType": "enum TransferProxy.Role",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_assetAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_depositAddress",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "_isAllowed",
          "type": "bool"
        }
      ],
      "name": "setAllowedDeposit",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_assetAddress",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_destination",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "_isAllowed",
          "type": "bool"
        }
      ],
      "name": "setAllowedDestination",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_recipientAddress",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "_isAllowed",
          "type": "bool"
        }
      ],
      "name": "setAllowedRecipient",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bool",
          "name": "_paused",
          "type": "bool"
        }
      ],
      "name": "setDepositsPaused",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "isAdding",
          "type": "bool"
        }
      ],
      "name": "setRoleAdmin",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "isAdding",
          "type": "bool"
        }
      ],
      "name": "setRoleAgent",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "isAdding",
          "type": "bool"
        }
      ],
      "name": "setRoleDepositor",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_assetAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_recipientAddress",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        },
        {
          "internalType": "uint32",
          "name": "_depositId",
          "type": "uint32"
        },
        {
          "internalType": "uint256",
          "name": "_originChainId",
          "type": "uint256"
        }
      ],
      "name": "withdrawToRecipient",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "stateMutability": "payable",
      "type": "receive"
    }
  ] as const