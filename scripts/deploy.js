async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const Factory = await ethers.getContractFactory("CustodyRegistry");
  const registry = await Factory.deploy();
  await registry.deployed();
  console.log("\nCustodyRegistry deployed from the factory to Distributor:\n", registry.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
