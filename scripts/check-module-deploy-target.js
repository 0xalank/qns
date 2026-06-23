const hre = require("hardhat");

const { ethers } = hre;

function normalizeQnsName(input) {
  let name = String(input || "").trim();
  if (name.endsWith(".qns")) name = name.slice(0, -4);
  name = name.toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new Error(`Invalid QNS example name: ${input}`);
  }
  return name;
}

function hashName(name) {
  return ethers.solidityPackedKeccak256(["string"], [name]);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const qnnsAddress = process.env.QNNS_CONTRACT || "";
  const exampleName = normalizeQnsName(process.env.EXAMPLE_QNS_NAME || "moduleexample");
  const nameHash = hashName(exampleName);

  console.log("QNS module deploy target check");
  console.log("Network:", network.name, "chainId:", network.chainId.toString());
  console.log("Deployer:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "QUAI");
  console.log("QNNS_CONTRACT:", qnnsAddress || "unset");
  console.log("Example name:", exampleName);
  console.log("Example nameHash:", nameHash);

  if (!qnnsAddress) {
    console.log("QNNS code: missing QNNS_CONTRACT");
    return;
  }

  const code = await ethers.provider.getCode(qnnsAddress);
  console.log("QNNS code bytes:", code === "0x" ? 0 : (code.length - 2) / 2);
  if (code === "0x") return;

  const qnns = await ethers.getContractAt("QNNS", qnnsAddress);
  try {
    console.log("QNNS name():", await qnns.name());
    console.log("QNNS symbol():", await qnns.symbol());
  } catch (error) {
    console.log("QNNS metadata read failed:", error.message);
  }

  try {
    console.log("Name active:", await qnns.isActive(nameHash));
  } catch (error) {
    console.log("Name active read failed:", error.message);
  }

  try {
    const owner = await qnns.ownerOf(BigInt(nameHash));
    console.log("Name owner:", owner);
    console.log("Deployer owns name:", owner.toLowerCase() === deployer.address.toLowerCase());
  } catch (error) {
    console.log("Name owner: unavailable");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
