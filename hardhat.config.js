// Only used to run a local JSON-RPC node for the end-to-end tests (`npx hardhat node`).
// The contract is not compiled by Hardhat; build/TaniloAnchor.json is the committed build.
export default { solidity: "0.8.28", paths: { sources: "./no-hardhat-sources" } };
