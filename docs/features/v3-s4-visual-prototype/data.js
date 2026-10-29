/*
 * Read-only design evidence. No runtime requests or calculations of market results.
 * Base fixtures: v3/tests/fixtures/s2/{basic-strategy,basic-run-spec,basic-snapshot}.json
 * Report values: v3/tests/golden/s2-basic-run.json
 * Event/digest evidence: .local/sr008-s2-qa/inspection/review-fix-cli-result.json
 * The CLI result was generated from the same three S2 fixtures. Key events are an
 * exact subset of its 34-event stream; no hashes, fills, metrics or dates are invented.
 */
window.SR_DATA = {
  source: {
    label: "synthetic contract test",
    caseId: "s2-basic-six-sessions",
    usageRestriction: "local synthetic contract test only",
    eventCount: 34
  },
  strategy: {
    schemaVersion: "1.0.0",
    name: "S2 basic buy then sell",
    indicators: {},
    entry: { gt: [{ const: "1" }, { const: "0" }] },
    exits: [{ gte: [{ ref: "position.barsHeld" }, { const: "2" }] }],
    position: { side: "long", allowAdd: false, entrySize: { cashFraction: "1.00" }, exitSize: { positionFraction: "1.00" } }
  },
  runSpec: {
    runSpecVersion: "1.0.0",
    strategy: { id: "synthetic-basic", revision: 1, digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
    asset: { assetId: "stock:synthetic.basic", assetType: "stock", executionProfile: "cn-stock@1" },
    data: { snapshotDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000", start: "2024-01-01", end: "2024-01-06" },
    warmup: { extraObservations: 0 },
    account: { initialCash: "2000.00", currency: "CNY" },
    execution: {
      feeProfileVersion: "cn-stock-demo-fee@1",
      slippageProfileVersion: "cn-stock-one-tick@1",
      visibilityRuleVersion: "asset-default@1",
      settlementProfileVersion: "cn-stock-settlement@1",
      reportProfileVersion: "cn-stock-report@1"
    },
    engine: {
      engineVersion: "1.0.0", registryVersion: "1.0.0", canonicalizationVersion: "canonicalization@1",
      decimalProfileVersion: "decimal@1", roundingProfileVersion: "rounding@1",
      indicatorArithmeticProfileVersion: "indicator-arithmetic@1"
    }
  },
  snapshot: {
    snapshotVersion: "1.0.0",
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    assetIdentity: { assetId: "stock:synthetic.basic", type: "stock", sourceTypeRaw: "synthetic", status: "active" },
    observationKind: "ohlcv",
    sessions: [
      { date: "2024-01-01", status: "trading", bar: { date: "2024-01-01", open: "10.00", high: "10.00", low: "10.00", close: "10.00", volume: "1000" } },
      { date: "2024-01-02", status: "trading", bar: { date: "2024-01-02", open: "10.00", high: "11.00", low: "10.00", close: "11.00", volume: "1000" } },
      { date: "2024-01-03", status: "trading", bar: { date: "2024-01-03", open: "11.00", high: "12.00", low: "11.00", close: "12.00", volume: "1000" } },
      { date: "2024-01-04", status: "trading", bar: { date: "2024-01-04", open: "12.00", high: "12.00", low: "9.00", close: "9.00", volume: "1000" } },
      { date: "2024-01-05", status: "trading", bar: { date: "2024-01-05", open: "10.00", high: "10.00", low: "10.00", close: "10.00", volume: "1000" } },
      { date: "2024-01-06", status: "trading", bar: { date: "2024-01-06", open: "10.00", high: "10.00", low: "10.00", close: "10.00", volume: "1000" } }
    ],
    corporateActions: [],
    source: [{ name: "hand-authored-synthetic", interface: "fixture", libraryVersion: "1" }],
    fixedRange: { start: "2024-01-01", end: "2024-01-06" },
    adjustment: "raw", pricePrecision: 2, volumeUnit: "share", qualityIssues: [], usageRestriction: "local synthetic contract test only"
  },
  report: {
    reportVersion: "1.0.0",
    runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
    strategyDigest: "sha256:2c64d48afe8815c82bd013701f9333abb8488db70be12b210533f4df50c9be17",
    snapshotDigest: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc",
    range: { start: "2024-01-01", end: "2024-01-06" },
    initialCash: "2000.00", finalEquity: "1987.48",
    metrics: {
      cumulativeReturn: "-0.006260000000", maxDrawdown: "0.136737177471", tradeCount: 2,
      winRate: "0.000000000000", winRateReason: null,
      excessReturn: "-0.003255000000", excessReturnReason: null
    },
    daily: [
      { date: "2024-01-01", equity: "2000.00", drawdown: "0.000000000000", cash: { available: "993.99", reserved: "1006.01", unsettled: "0.00", receivable: "0.00", total: "2000.00" }, position: { total: "0", sellable: "0", reserved: "0", unsettled: "0" } },
      { date: "2024-01-02", equity: "2093.99", drawdown: "0.000000000000", cash: { available: "993.99", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "993.99" }, position: { total: "100", sellable: "0", reserved: "0", unsettled: "100" } },
      { date: "2024-01-03", equity: "2193.99", drawdown: "0.000000000000", cash: { available: "993.99", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "993.99" }, position: { total: "100", sellable: "100", reserved: "0", unsettled: "0" } },
      { date: "2024-01-04", equity: "1893.99", drawdown: "0.136737177471", cash: { available: "993.99", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "993.99" }, position: { total: "100", sellable: "0", reserved: "100", unsettled: "0" } },
      { date: "2024-01-05", equity: "1987.48", drawdown: "0.094125315065", cash: { available: "993.99", reserved: "0.00", unsettled: "993.49", receivable: "0.00", total: "1987.48" }, position: { total: "0", sellable: "0", reserved: "0", unsettled: "0" } },
      { date: "2024-01-06", equity: "1987.48", drawdown: "0.094125315065", cash: { available: "1987.48", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "1987.48" }, position: { total: "0", sellable: "0", reserved: "0", unsettled: "0" } }
    ],
    orders: [
      { intentId: "intent-1", date: "2024-01-01", side: "buy", quantity: "100", status: "created", reason: null },
      { date: "2024-01-02", side: "buy", quantity: "100", status: "filled", reason: null },
      { intentId: "intent-2", date: "2024-01-04", side: "sell", quantity: "100", status: "created", reason: null },
      { date: "2024-01-05", side: "sell", quantity: "100", status: "filled", reason: null },
      { date: "2024-01-05", side: "buy", quantity: "0", status: "rejected", reason: "INSUFFICIENT_CASH" }
    ],
    fills: [
      { date: "2024-01-02", side: "buy", price: "10.01", quantity: "100", amount: "1001.00", commission: "5.00", transferFee: "0.01", stampDuty: "0.00", fees: "5.01", cashDelta: "-1006.01" },
      { date: "2024-01-05", side: "sell", price: "9.99", quantity: "100", amount: "999.00", commission: "5.00", transferFee: "0.01", stampDuty: "0.50", fees: "5.51", cashDelta: "993.49" }
    ],
    rejections: [{ date: "2024-01-05", side: "buy", quantity: "0", status: "rejected", reason: "INSUFFICIENT_CASH" }],
    fees: { commission: "10.00", transferFee: "0.02", stampDuty: "0.50", total: "10.52" },
    cash: { available: "1987.48", reserved: "0.00", unsettled: "0.00", receivable: "0.00", total: "1987.48" },
    position: { total: "0", sellable: "0", reserved: "0", unsettled: "0" },
    final: { realizedPnl: "-12.52" },
    buyAndHold: { finalEquity: "1993.99", cumulativeReturn: "-0.003005000000", reason: null },
    assumptions: ["cn-stock-demo-fee@1", "cn-stock-one-tick@1", "cn-stock-settlement@1", "cn-stock-report@1", "DIVIDEND_TAX_NOT_SIMULATED", "SYNTHETIC_DEMO_ONLY_NOT_LIVE_TRADING"],
    warnings: [],
    eventDigest: "sha256:d18be8504251057ad0b736d88f1bb73b30528d79dba9046df3af6c37552c7a26",
    reportDigest: "sha256:6132533bc35c4e16ddccdd5e4dd56b41d72c37215cfe92567171d5d455c717c5"
  },
  events: [
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 1, tradingDate: "2024-01-01", phase: "close", type: "SignalEvaluated", reasonCodes: ["ENTRY_TRUE"],
      inputRefs: { bar: "2024-01-01", snapshot: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc", strategyPath: "/entry" },
      payload: { entry: true, exit: false }, previousEventHash: "sha256:12a3fce4bcffd34c5a79b7a07ead5749d4ac55b5e26b8b8fd977d8ed06bd86c7", eventHash: "sha256:6b6edc619739ade5cc333a5499a3105014387b70abbf25deefc858962ff014ae"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 2, tradingDate: "2024-01-01", phase: "close", type: "OrderIntentCreated", reasonCodes: ["BUY_NEXT_SESSION"],
      inputRefs: { intent: "intent-1", bar: "2024-01-01", strategyPath: "/entry" },
      payload: { intentId: "intent-1", date: "2024-01-01", side: "buy", quantity: "100", status: "created", reason: null, estimatedPrice: "10.01", estimatedBudget: "2000.00" },
      previousEventHash: "sha256:6b6edc619739ade5cc333a5499a3105014387b70abbf25deefc858962ff014ae", eventHash: "sha256:c6edf1a2bf604355ba6e6bb537edc8c0b44ca7dac6436aa4d676fb87c70ae316"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 3, tradingDate: "2024-01-01", phase: "close", type: "CashChanged", reasonCodes: ["BUY_RESERVED"],
      inputRefs: { intent: "intent-1", bar: "2024-01-01" }, payload: { amount: "1006.01" },
      previousEventHash: "sha256:c6edf1a2bf604355ba6e6bb537edc8c0b44ca7dac6436aa4d676fb87c70ae316", eventHash: "sha256:a8346ca356eede18647dc0153148d6e496830ba88eeb07c7566509b5c6ab4ab0"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 4, tradingDate: "2024-01-01", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "10.00", equity: "2000.00" },
      previousEventHash: "sha256:a8346ca356eede18647dc0153148d6e496830ba88eeb07c7566509b5c6ab4ab0", eventHash: "sha256:64d72f86e84d7dbc12b8a28a48f0a84f4cb70c8e7be27f080f8bd76d1469f088"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 7, tradingDate: "2024-01-02", phase: "open-execution", type: "OrderFilled", reasonCodes: ["BUY"],
      inputRefs: { intent: "intent-1", fill: "fill-1", bar: "2024-01-02" },
      payload: { date: "2024-01-02", side: "buy", price: "10.01", quantity: "100", amount: "1001.00", commission: "5.00", transferFee: "0.01", stampDuty: "0.00", fees: "5.01", cashDelta: "-1006.01", intentQuantity: "100", quantityReason: null },
      previousEventHash: "sha256:b49773ced39d8d50a8e91c3797fbd39f9433813b0032ddfddf348478c70a9e3f", eventHash: "sha256:c336ab42fdd8900a3f268216f831bea48d49f57f1d2750016ffb3266fde39e6b"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 8, tradingDate: "2024-01-02", phase: "open-execution", type: "CashChanged", reasonCodes: ["BUY_COST"],
      inputRefs: { intent: "intent-1", fill: "fill-1", bar: "2024-01-02" }, payload: { amount: "-1006.01" },
      previousEventHash: "sha256:c336ab42fdd8900a3f268216f831bea48d49f57f1d2750016ffb3266fde39e6b", eventHash: "sha256:f57c894db74821ad0d5ab014e4d4f659b84334262475923e96582af49fa83304"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 9, tradingDate: "2024-01-02", phase: "open-execution", type: "PositionChanged", reasonCodes: ["BUY_UNSETTLED"],
      inputRefs: { intent: "intent-1", fill: "fill-1", bar: "2024-01-02" }, payload: { quantity: "100" },
      previousEventHash: "sha256:f57c894db74821ad0d5ab014e4d4f659b84334262475923e96582af49fa83304", eventHash: "sha256:ab85f45bcdd0f4757e43ee19a32f7325b5d93b9a208fd02002e7167ece0b1006"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 10, tradingDate: "2024-01-02", phase: "close", type: "SignalEvaluated", reasonCodes: ["ENTRY_TRUE"],
      inputRefs: { bar: "2024-01-02", snapshot: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc", strategyPath: "/entry" }, payload: { entry: true, exit: false },
      previousEventHash: "sha256:ab85f45bcdd0f4757e43ee19a32f7325b5d93b9a208fd02002e7167ece0b1006", eventHash: "sha256:54d7791afcc218b0b7d53fb24daaadd6611274b9e15f3a6af869bac97c458cb9"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 11, tradingDate: "2024-01-02", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "11.00", equity: "2093.99" },
      previousEventHash: "sha256:54d7791afcc218b0b7d53fb24daaadd6611274b9e15f3a6af869bac97c458cb9", eventHash: "sha256:ed2e36922ad8456fb89db22b8e1b8f8673a92fb8d9d227b382a3096c54d6062d"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 14, tradingDate: "2024-01-03", phase: "close", type: "SignalEvaluated", reasonCodes: ["ENTRY_TRUE"],
      inputRefs: { bar: "2024-01-03", snapshot: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc", strategyPath: "/entry" }, payload: { entry: true, exit: false },
      previousEventHash: "sha256:856273b120c6728acfaada07b3521846894d11ad0cadbe712b217c238387c6d1", eventHash: "sha256:a96403e4737be6a44b92eb2f6799b270b7d8c131148ee5bb3fdc3650a9189b62"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 15, tradingDate: "2024-01-03", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "12.00", equity: "2193.99" },
      previousEventHash: "sha256:a96403e4737be6a44b92eb2f6799b270b7d8c131148ee5bb3fdc3650a9189b62", eventHash: "sha256:29c290fcf4412ca48af11fa3dd4748077818639f0d74220f3b6cf92ebac51849"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 17, tradingDate: "2024-01-04", phase: "close", type: "SignalEvaluated", reasonCodes: ["ENTRY_TRUE"],
      inputRefs: { bar: "2024-01-04", snapshot: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc", strategyPath: "/entry" }, payload: { entry: true, exit: true },
      previousEventHash: "sha256:a40cbae43e46f57ecf05ef3af9d33e78670cc1e0e312cd40bc4470aea81d3a42", eventHash: "sha256:11f7210efc86b204c57bffae7e932404ed2c73a9b3e42df6885a09a194020886"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 18, tradingDate: "2024-01-04", phase: "close", type: "OrderIntentCreated", reasonCodes: ["SELL_NEXT_SESSION"],
      inputRefs: { intent: "intent-2", bar: "2024-01-04", strategyPath: "/exits/0" },
      payload: { intentId: "intent-2", date: "2024-01-04", side: "sell", quantity: "100", status: "created", reason: null, referencePrice: "9.00", sellableQuantity: "100" },
      previousEventHash: "sha256:11f7210efc86b204c57bffae7e932404ed2c73a9b3e42df6885a09a194020886", eventHash: "sha256:960f883d8e2fc02aabbc6b2566f7ef842f607a45cdba4a899837fef575809e10"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 19, tradingDate: "2024-01-04", phase: "close", type: "PositionChanged", reasonCodes: ["SELL_RESERVED"],
      inputRefs: { intent: "intent-2", bar: "2024-01-04" }, payload: { quantity: "100" },
      previousEventHash: "sha256:960f883d8e2fc02aabbc6b2566f7ef842f607a45cdba4a899837fef575809e10", eventHash: "sha256:fbe29e3ba19de472c381c3135eb5f4599f127a11e3d5410cb42b5a2fdc67d501"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 20, tradingDate: "2024-01-04", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "9.00", equity: "1893.99" },
      previousEventHash: "sha256:fbe29e3ba19de472c381c3135eb5f4599f127a11e3d5410cb42b5a2fdc67d501", eventHash: "sha256:f97790e034cf7be22c1d20a96682d6f5ac73c4d8e81f8e6a5b55ecd9ec21db25"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 22, tradingDate: "2024-01-05", phase: "open-execution", type: "OrderFilled", reasonCodes: ["SELL"],
      inputRefs: { intent: "intent-2", fill: "fill-2", bar: "2024-01-05" },
      payload: { date: "2024-01-05", side: "sell", price: "9.99", quantity: "100", amount: "999.00", commission: "5.00", transferFee: "0.01", stampDuty: "0.50", fees: "5.51", cashDelta: "993.49" },
      previousEventHash: "sha256:254fd47cf6b6c9b9133b9ae038a2e1ae4f1b1c2a177531e81145f551548ee8da", eventHash: "sha256:beaa0248e0e864d0370736370b5b49bbf9ffe808cb1e7d37ff2c2ace143769d2"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 23, tradingDate: "2024-01-05", phase: "open-execution", type: "CashChanged", reasonCodes: ["SELL_UNSETTLED"],
      inputRefs: { intent: "intent-2", fill: "fill-2", bar: "2024-01-05" }, payload: { amount: "993.49" },
      previousEventHash: "sha256:beaa0248e0e864d0370736370b5b49bbf9ffe808cb1e7d37ff2c2ace143769d2", eventHash: "sha256:7142abedac8dff43ed0bd991d17336aed92bf8a04175318436a02b26daf32d39"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 26, tradingDate: "2024-01-05", phase: "open-execution", type: "OrderRejected", reasonCodes: ["INSUFFICIENT_CASH"],
      inputRefs: { system: "no-external-input" }, payload: { date: "2024-01-05", side: "buy", quantity: "0", status: "rejected", reason: "INSUFFICIENT_CASH" },
      previousEventHash: "sha256:52997f00632ef7149ffb0a0eed92989a9be8b31d5100577ec7e8e8043c5ba42c", eventHash: "sha256:c65364bb701a6c31ef8c20b643a13cb17263217e389a486932177818fe6398be"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 27, tradingDate: "2024-01-05", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "10.00", equity: "1987.48" },
      previousEventHash: "sha256:c65364bb701a6c31ef8c20b643a13cb17263217e389a486932177818fe6398be", eventHash: "sha256:d3bb24121fdc21002856e599f44d501975ce7cc9037349fe696cf5acb6f68281"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 29, tradingDate: "2024-01-06", phase: "session-open", type: "CashChanged", reasonCodes: ["SELL_PROCEEDS_SETTLED"],
      inputRefs: { system: "no-external-input" }, payload: { amount: "993.49" },
      previousEventHash: "sha256:b14d8a6fe05049563598399a4c19cdc1f3ad374f657ed4bcc00da37bb4281c97", eventHash: "sha256:e0f7af25c05f28a02c46297a4baafdbf0711c624c76a7c3c2f56ba3d1e7e7d8f"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 30, tradingDate: "2024-01-06", phase: "close", type: "SignalEvaluated", reasonCodes: ["ENTRY_TRUE"],
      inputRefs: { bar: "2024-01-06", snapshot: "sha256:7460eeb6d3e6e4eea4c5fda222751f793c640286f80fa758a69eb9b93ac385dc", strategyPath: "/entry" }, payload: { entry: true, exit: true },
      previousEventHash: "sha256:e0f7af25c05f28a02c46297a4baafdbf0711c624c76a7c3c2f56ba3d1e7e7d8f", eventHash: "sha256:7d9e5d0bafcd90207ad45858b0bb44f1c1acba1bab367f38cd1f17748fac1be5"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 31, tradingDate: "2024-01-06", phase: "close", type: "MarkToMarket", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { close: "10.00", equity: "1987.48" },
      previousEventHash: "sha256:7d9e5d0bafcd90207ad45858b0bb44f1c1acba1bab367f38cd1f17748fac1be5", eventHash: "sha256:45293d0757d39bcebed450c55fa9a8ef267e86176b9321a8a7d8e1b600e35925"
    },
    {
      eventVersion: "1.0.0", runDigest: "sha256:8ec5cb9d8718d9df21c9696ab299ca0841c7c2f8d77c3ccdf8f5a0fb7b1acd70",
      seq: 33, tradingDate: "2024-01-06", phase: "run-end", type: "RunCompleted", reasonCodes: [], inputRefs: { system: "no-external-input" }, payload: { eventCount: 34 },
      previousEventHash: "sha256:67069ca114abff991477cfd4743f9487b4a52320d60442ebf303351e2e5fe1a1", eventHash: "sha256:14daa635cd843a88c2eb3efbef033c1fd80f32ffaa4c56b63998b83bdc73041d"
    }
  ]
};
