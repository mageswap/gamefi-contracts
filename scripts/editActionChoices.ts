import {ethers} from "hardhat";
import {WORLD_ADDRESS} from "./contractAddresses";
import {allActionChoicesForging} from "./data/actionChoices";
import {allActionChoiceIdsForging} from "./data/actionChoiceIds";
import {EstforConstants} from "@paintswap/estfor-definitions";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log(`Edit action choices using account: ${owner.address} on chain id ${await owner.getChainId()}`);

  const world = await ethers.getContractAt("World", WORLD_ADDRESS);

  const actionChoicesToUpdate = new Set([
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_ARMOR,
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_HELMET,
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_TASSETS,
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_GAUNTLETS,
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_BOOTS,
    EstforConstants.ACTIONCHOICE_FORGING_ORICHALCUM_SHIELD,
  ]);

  const actionChoiceIndices = allActionChoiceIdsForging.reduce((indices: number[], actionChoiceId, index) => {
    if (actionChoicesToUpdate.has(actionChoiceId)) {
      indices.push(index);
    }
    return indices;
  }, []);

  const actionChoices = actionChoiceIndices.map((index) => allActionChoicesForging[index]);
  const actionChoiceIds = actionChoiceIndices.map((index) => allActionChoiceIdsForging[index]);

  if (actionChoices.length !== actionChoicesToUpdate.size || actionChoiceIds.length !== actionChoicesToUpdate.size) {
    console.error("ActionChoiceIds not found");
  } else {
    {
      const tx = await world.editActionChoices(EstforConstants.ACTION_FORGING_ITEM, actionChoiceIds, actionChoices);
      await tx.wait();
    }
  }

  /*
  {
    const tx = await world.editActionChoices(
      EstforConstants.ACTION_FORGING_ITEM,
      allActionChoiceIdsForging,
      allActionChoicesForging
    );
    await tx.wait();
  } */
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
