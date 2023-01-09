// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

enum Skill {
  NONE,
  PAINT,
  DEFENCE,
  FISH,
  COOK
}

// Dummy is there so that we start at 1
enum Items {
  DUMMY,
  MYSTERY_BOX,
  RAID_PASS,
  BRUSH,
  WAND,
  SHIELD,
  BRONZE_NECKLACE,
  WOODEN_FISHING_ROD,
  IGNORE_NOW_OTHER_ITEMS,
  COD
}

struct ActionInfo {
  Skill skill;
  uint8 baseXPPerHour;
  uint32 minSkillPoints;
  uint8 itemTokenIdRangeMin; // Inclusive
  uint8 itemTokenIdRangeMax; // Exclusive
}
