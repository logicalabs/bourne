import { ponder } from "ponder:registry";
import { tx, proxyTransfer, withdrawToRecipient, depositsPaused, allowedDepositSet, allowedDestinationSet, allowedRecipientSet, proxy_transfers } from "ponder:schema";

ponder.on("TransferProxy:eventProxyTransfer", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 201,
  }).onConflictDoNothing();

  await context.db.insert(proxyTransfer).values({
    depositId: BigInt(event.args.depositId),
    originChainId: BigInt(contextNetwork.id),
    destinationChainId: BigInt(event.args.destinationChainId),
    assetAddress: event.args.assetAddress,
    recipientAddress: event.args.recipientAddress,
    amount: BigInt(event.args.amount),
    depositAddress: event.args.depositAddress,
    txhash: event.transaction.hash,
  }).onConflictDoNothing();

  
  await context.db.insert(proxy_transfers).values({
    proxy_contract: event.log.address,
    depositId: BigInt(event.args.depositId),
    originChainId: BigInt(contextNetwork.id),
    destinationChainId: BigInt(event.args.destinationChainId),
    assetAddress: event.args.assetAddress,
    recipientAddress: event.args.recipientAddress,
    amount: BigInt(event.args.amount),

    transfer_ts: event.block.timestamp,

    // event-specific fields
    depositAddress: event.args.depositAddress,
    txhash_deposit: event.transaction.hash,
    deposit_ts: event.block.timestamp,

  })
  .onConflictDoUpdate({
    depositAddress: event.args.depositAddress,
    txhash_deposit: event.transaction.hash,
    transfer_ts: event.block.timestamp,
    deposit_ts: event.block.timestamp,
  });

});

ponder.on("TransferProxy:eventWithdrawToRecipient", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 202,
  }).onConflictDoNothing();

  await context.db.insert(withdrawToRecipient).values({
    depositId: BigInt(event.args.depositId),
    originChainId: BigInt(event.args.originChainId),
    destinationChainId: BigInt(contextNetwork.id),
    assetAddress: event.args.assetAddress,
    recipientAddress: event.args.recipientAddress,
    amount: BigInt(event.args.amount),
    txhash: event.transaction.hash,
  }).onConflictDoNothing();

  
  await context.db.insert(proxy_transfers).values({
    proxy_contract: event.log.address,
    depositId: BigInt(event.args.depositId),
    originChainId: BigInt(event.args.originChainId),
    destinationChainId: BigInt(contextNetwork.id),
    assetAddress: event.args.assetAddress,
    recipientAddress: event.args.recipientAddress,
    amount: BigInt(event.args.amount),

    transfer_ts: event.block.timestamp,

    // event-specific fields
    txhash_withdraw: event.transaction.hash,
    withdraw_ts: event.block.timestamp,

  })
  .onConflictDoUpdate({
    txhash_withdraw: event.transaction.hash,
    withdraw_ts: event.block.timestamp,
  });
  
});

ponder.on("TransferProxy:eventDepositsPaused", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 203,
  }).onConflictDoNothing();

  await context.db.insert(depositsPaused).values({
    chainId: BigInt(contextNetwork.id),
    isPaused: event.args.isPaused,
    txhash: event.transaction.hash,
  }).onConflictDoNothing();
});


ponder.on("TransferProxy:eventAllowedDepositSet", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 204,
  }).onConflictDoNothing();

  await context.db.insert(allowedDepositSet).values({
    chainId: BigInt(contextNetwork.id),
    assetAddress: event.args.assetAddress,
    depositAddress: event.args.depositAddress,
    isAllowed: event.args.isAllowed,
    txhash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("TransferProxy:eventAllowedDestinationSet", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 205,
  }).onConflictDoNothing();

  await context.db.insert(allowedDestinationSet).values({
    chainId: BigInt(contextNetwork.id),
    assetAddress: event.args.assetAddress,
    destinationChainId: BigInt(event.args.destinationAddress),
    isAllowed: event.args.isAllowed,
    txhash: event.transaction.hash,
  }).onConflictDoNothing();
});

ponder.on("TransferProxy:eventAllowedRecipientSet", async ({ event, context }) => {
  const contextNetwork = context.chain;

  await context.db.insert(tx).values({
    txhash: event.transaction.hash,
    txchainid: BigInt(contextNetwork.id),
    txfrom: event.transaction.from,
    txto: event.transaction.to || undefined,
    txgasprice: event.transaction.gasPrice?.toString(),
    txmaxfeepergas: event.transaction.maxFeePerGas?.toString(),
    txmaxpriorityfeepergas: event.transaction.maxPriorityFeePerGas?.toString(),
    txgaslimit: event.transaction.gas,
    txblocknum: event.block.number,
    txblockts: event.block.timestamp,
    txcreatedby: 206,
  }).onConflictDoNothing();

  await context.db.insert(allowedRecipientSet).values({
    chainId: BigInt(contextNetwork.id),
    recipientAddress: event.args.recipientAddress,
    isAllowed: event.args.isAllowed,
    txhash: event.transaction.hash,
  }).onConflictDoNothing();
});


