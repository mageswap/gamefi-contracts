import {EstforConstants} from "@paintswap/estfor-definitions";
import {ethers, upgrades} from "hardhat";
import {ITEM_NFT_ADDRESS, ITEM_NFT_LIBRARY_ADDRESS} from "./contractAddresses";
import {allItems} from "./data/items";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log(`Add items using account: ${owner.address} on chain id ${await owner.getChainId()}`);

  const ItemNFT = (
    await ethers.getContractFactory("ItemNFT", {libraries: {ItemNFTLibrary: ITEM_NFT_LIBRARY_ADDRESS}})
  ).connect(owner);
  const itemNFT = await upgrades.upgradeProxy(ITEM_NFT_ADDRESS, ItemNFT, {
    kind: "uups",
    unsafeAllow: ["external-library-linking"],
  });

  const itemIds = new Set([
    EstforConstants.ORICHALCUM_HELMET_1,
    EstforConstants.ORICHALCUM_ARMOR_1,
    EstforConstants.ORICHALCUM_TASSETS_1,
    EstforConstants.ORICHALCUM_GAUNTLETS_1,
    EstforConstants.ORICHALCUM_BOOTS_1,
    EstforConstants.ORICHALCUM_SHIELD_1,
    EstforConstants.DRAGONSTONE_AMULET_1,
    EstforConstants.MASTER_HAT_1,
    EstforConstants.MASTER_BODY_1,
    EstforConstants.MASTER_TROUSERS_1,
    EstforConstants.MASTER_BRACERS_1,
    EstforConstants.MASTER_BOOTS_1,
    EstforConstants.ORICHALCUM_SWORD_1,
    EstforConstants.DRAGONSTONE_STAFF_1,
    EstforConstants.GODLY_BOW_1,
    EstforConstants.SCORCHING_COWL_1,
    EstforConstants.SCORCHING_BODY_1,
    EstforConstants.SCORCHING_CHAPS_1,
    EstforConstants.SCORCHING_BRACERS_1,
    EstforConstants.SCORCHING_BOOTS_1,
    EstforConstants.ORICHALCUM_HELMET_2,
    EstforConstants.ORICHALCUM_ARMOR_2,
    EstforConstants.ORICHALCUM_TASSETS_2,
    EstforConstants.ORICHALCUM_GAUNTLETS_2,
    EstforConstants.ORICHALCUM_BOOTS_2,
    EstforConstants.ORICHALCUM_SHIELD_2,
    EstforConstants.DRAGONSTONE_AMULET_2,
    EstforConstants.MASTER_HAT_2,
    EstforConstants.MASTER_BODY_2,
    EstforConstants.MASTER_TROUSERS_2,
    EstforConstants.MASTER_BRACERS_2,
    EstforConstants.MASTER_BOOTS_2,
    EstforConstants.ORICHALCUM_SWORD_2,
    EstforConstants.DRAGONSTONE_STAFF_2,
    EstforConstants.GODLY_BOW_2,
    EstforConstants.SCORCHING_COWL_2,
    EstforConstants.SCORCHING_BODY_2,
    EstforConstants.SCORCHING_CHAPS_2,
    EstforConstants.SCORCHING_BRACERS_2,
    EstforConstants.SCORCHING_BOOTS_2,
    EstforConstants.ORICHALCUM_HELMET_3,
    EstforConstants.ORICHALCUM_ARMOR_3,
    EstforConstants.ORICHALCUM_TASSETS_3,
    EstforConstants.ORICHALCUM_GAUNTLETS_3,
    EstforConstants.ORICHALCUM_BOOTS_3,
    EstforConstants.ORICHALCUM_SHIELD_3,
    EstforConstants.DRAGONSTONE_AMULET_3,
    EstforConstants.MASTER_HAT_3,
    EstforConstants.MASTER_BODY_3,
    EstforConstants.MASTER_TROUSERS_3,
    EstforConstants.MASTER_BRACERS_3,
    EstforConstants.MASTER_BOOTS_3,
    EstforConstants.ORICHALCUM_SWORD_3,
    EstforConstants.DRAGONSTONE_STAFF_3,
    EstforConstants.GODLY_BOW_3,
    EstforConstants.SCORCHING_COWL_3,
    EstforConstants.SCORCHING_BODY_3,
    EstforConstants.SCORCHING_CHAPS_3,
    EstforConstants.SCORCHING_BRACERS_3,
    EstforConstants.SCORCHING_BOOTS_3,
    EstforConstants.ORICHALCUM_HELMET_4,
    EstforConstants.ORICHALCUM_ARMOR_4,
    EstforConstants.ORICHALCUM_TASSETS_4,
    EstforConstants.ORICHALCUM_GAUNTLETS_4,
    EstforConstants.ORICHALCUM_BOOTS_4,
    EstforConstants.ORICHALCUM_SHIELD_4,
    EstforConstants.DRAGONSTONE_AMULET_4,
    EstforConstants.MASTER_HAT_4,
    EstforConstants.MASTER_BODY_4,
    EstforConstants.MASTER_TROUSERS_4,
    EstforConstants.MASTER_BRACERS_4,
    EstforConstants.MASTER_BOOTS_4,
    EstforConstants.ORICHALCUM_SWORD_4,
    EstforConstants.DRAGONSTONE_STAFF_4,
    EstforConstants.GODLY_BOW_4,
    EstforConstants.SCORCHING_COWL_4,
    EstforConstants.SCORCHING_BODY_4,
    EstforConstants.SCORCHING_CHAPS_4,
    EstforConstants.SCORCHING_BRACERS_4,
    EstforConstants.SCORCHING_BOOTS_4,
    EstforConstants.ORICHALCUM_HELMET_5,
    EstforConstants.ORICHALCUM_ARMOR_5,
    EstforConstants.ORICHALCUM_TASSETS_5,
    EstforConstants.ORICHALCUM_GAUNTLETS_5,
    EstforConstants.ORICHALCUM_BOOTS_5,
    EstforConstants.ORICHALCUM_SHIELD_5,
    EstforConstants.DRAGONSTONE_AMULET_5,
    EstforConstants.MASTER_HAT_5,
    EstforConstants.MASTER_BODY_5,
    EstforConstants.MASTER_TROUSERS_5,
    EstforConstants.MASTER_BRACERS_5,
    EstforConstants.MASTER_BOOTS_5,
    EstforConstants.ORICHALCUM_SWORD_5,
    EstforConstants.DRAGONSTONE_STAFF_5,
    EstforConstants.GODLY_BOW_5,
    EstforConstants.SCORCHING_COWL_5,
    EstforConstants.SCORCHING_BODY_5,
    EstforConstants.SCORCHING_CHAPS_5,
    EstforConstants.SCORCHING_BRACERS_5,
    EstforConstants.SCORCHING_BOOTS_5,
    EstforConstants.INFUSED_ORICHALCUM_HELMET,
    EstforConstants.INFUSED_ORICHALCUM_ARMOR,
    EstforConstants.INFUSED_ORICHALCUM_TASSETS,
    EstforConstants.INFUSED_ORICHALCUM_GAUNTLETS,
    EstforConstants.INFUSED_ORICHALCUM_BOOTS,
    EstforConstants.INFUSED_ORICHALCUM_SHIELD,
    EstforConstants.INFUSED_DRAGONSTONE_AMULET,
    EstforConstants.INFUSED_MASTER_HAT,
    EstforConstants.INFUSED_MASTER_BODY,
    EstforConstants.INFUSED_MASTER_TROUSERS,
    EstforConstants.INFUSED_MASTER_BRACERS,
    EstforConstants.INFUSED_MASTER_BOOTS,
    EstforConstants.INFUSED_ORICHALCUM_SWORD,
    EstforConstants.INFUSED_DRAGONSTONE_STAFF,
    EstforConstants.INFUSED_GODLY_BOW,
    EstforConstants.INFUSED_SCORCHING_COWL,
    EstforConstants.INFUSED_SCORCHING_BODY,
    EstforConstants.INFUSED_SCORCHING_CHAPS,
    EstforConstants.INFUSED_SCORCHING_BRACERS,
    EstforConstants.INFUSED_SCORCHING_BOOTS,
  ]);

  const items = allItems.filter((item) => itemIds.has(item.tokenId));
  if (items.length !== itemIds.size) {
    console.log("Cannot find all items");
  } else {
    await itemNFT.addItems(items);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
