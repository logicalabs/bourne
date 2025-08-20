import { onchainTable, index, primaryKey } from "ponder";

export const depositsPaused = onchainTable("event_deposits_paused", (t) => ({
  chainId: t.bigint(),
  isPaused: t.boolean(),
  txhash: t.hex().primaryKey()
}));

export const proxy_transfers = onchainTable("proxy_transfers", (t) => ({
  proxy_contract: t.hex().notNull(),
  depositId: t.bigint().notNull(),
  originChainId: t.bigint().notNull(),
  destinationChainId: t.bigint().notNull(),
  assetAddress: t.hex().notNull(),
  recipientAddress: t.hex().notNull(),
  amount: t.bigint().notNull(),


  transfer_ts: t.bigint().notNull(),

  // deposit-side fields
  depositAddress: t.hex(),
  txhash_deposit: t.hex(),
  deposit_ts: t.bigint(),

  // withdraw-side fields
  txhash_withdraw: t.hex(),
  withdraw_ts: t.bigint(),

}), (table) => ({
  pk: primaryKey({ columns: [table.proxy_contract, table.originChainId, table.depositId] }),
  ix_hash_deposit: index().on(table.txhash_deposit),
  ix_hash_withdraw: index().on(table.txhash_withdraw),
}));

export const proxyTransfer = onchainTable("event_proxy_transfer", (t) => ({
  depositId: t.bigint(),
  originChainId: t.bigint(),
  destinationChainId: t.bigint(),
  assetAddress: t.hex(),
  recipientAddress: t.hex(),
  amount: t.bigint(),
  depositAddress: t.hex(),

  txhash: t.hex()
}), (table) => ({
  pk: primaryKey({ columns: [table.originChainId, table.depositId] }),
  ix_txhash: index().on(table.txhash),
}));

export const withdrawToRecipient = onchainTable("event_withdraw_to_recipient", (t) => ({
  depositId: t.bigint(),
  originChainId: t.bigint(),
  destinationChainId: t.bigint(),
  assetAddress: t.hex(),
  recipientAddress: t.hex(),
  amount: t.bigint(),

  txhash: t.hex()
}), (table) => ({
  pk: primaryKey({ columns: [table.originChainId, table.depositId] }),
  ix_txhash: index().on(table.txhash),
}));

export const allowedDepositSet = onchainTable("event_allowed_deposit_set", (t) => ({
  chainId: t.bigint(),
  assetAddress: t.hex(),
  depositAddress: t.hex(),
  isAllowed: t.boolean(),
  txhash: t.hex()
}), (table) => ({
  pk: primaryKey({ columns: [table.txhash, table.assetAddress, table.depositAddress] }),
  ix_txhash: index().on(table.txhash),
}));

export const allowedDestinationSet = onchainTable("event_allowed_destination_set", (t) => ({
  chainId: t.bigint(),
  assetAddress: t.hex(),
  destinationChainId: t.bigint(),
  isAllowed: t.boolean(),
  txhash: t.hex()
}), (table) => ({
  pk: primaryKey({ columns: [table.txhash, table.assetAddress, table.destinationChainId] }),
  ix_txhash: index().on(table.txhash),
}));

export const allowedRecipientSet = onchainTable("event_allowed_recipient_set", (t) => ({
  chainId: t.bigint(),
  recipientAddress: t.hex(),
  isAllowed: t.boolean(),
  txhash: t.hex()
}), (table) => ({
  pk: primaryKey({ columns: [table.txhash, table.recipientAddress] }),
  ix_txhash: index().on(table.txhash),
}));

export const tx = onchainTable("tx", (t) => ({
  txhash: t.hex().primaryKey(),
  txchainid: t.bigint().notNull(),
  txfrom: t.hex().notNull(),
  txto: t.hex(),
  txgasprice: t.varchar(),
  txmaxfeepergas: t.varchar(),
  txmaxpriorityfeepergas: t.varchar(),
  txgaslimit: t.bigint().notNull(),
  txblocknum: t.bigint().notNull(),
  txblockts: t.bigint().notNull(),
  txcreatedby: t.smallint().notNull()
}), (table) => ({
  ix_txblockts: index().on(table.txblockts),
}));

