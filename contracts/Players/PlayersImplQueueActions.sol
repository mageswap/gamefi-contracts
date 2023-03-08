// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./PlayersImplBase.sol";

contract PlayersImplQueueActions is PlayersUpgradeableImplDummyBase, PlayersBase {
  constructor() {
    _checkStartSlot();
  }

  error NoItemBalance(uint16 itemTokenId);

  function startActions(
    uint _playerId,
    QueuedAction[] memory _queuedActions,
    uint16 _boostItemTokenId,
    ActionQueueStatus _queueStatus
  ) external {
    if (_queuedActions.length == 0) {
      revert SkillsArrayZero();
    }

    address from = msg.sender;
    uint totalTimespan;
    QueuedAction[] memory remainingSkills = _processActions(from, _playerId);

    if (_boostItemTokenId != NONE) {
      consumeBoost(_playerId, _boostItemTokenId, uint40(block.timestamp));
    }

    Player storage player = players[_playerId];
    if (_queueStatus == ActionQueueStatus.NONE) {
      if (player.actionQueue.length != 0) {
        // Clear action queue
        QueuedAction[] memory queuedActions;
        player.actionQueue = queuedActions;
      }
      if (_queuedActions.length > 3) {
        revert TooManyActionsQueued();
      }
    } else {
      if (_queueStatus == ActionQueueStatus.KEEP_LAST_IN_PROGRESS && remainingSkills.length > 1) {
        // Only want one
        assembly ("memory-safe") {
          mstore(remainingSkills, 1)
        }
      }

      // Keep remaining actions
      if (remainingSkills.length + _queuedActions.length > 3) {
        revert TooManyActionsQueuedSomeAlreadyExist();
      }
      player.actionQueue = remainingSkills;
      uint j = remainingSkills.length;
      while (j != 0) {
        unchecked {
          --j;
        }
        totalTimespan += remainingSkills[j].timespan;
      }
    }

    uint prevEndTime = block.timestamp + totalTimespan;

    uint256 i;
    uint64 queueId = latestQueueId;
    do {
      QueuedAction memory queuedAction = _queuedActions[i];

      if (totalTimespan + queuedAction.timespan > MAX_TIME) {
        // Must be the last one which will exceed the max time
        if (i != _queuedActions.length - 1) {
          revert ActionTimespanExceedsMaxTime();
        }
        // Shorten it so that it does not extend beyond the max time
        queuedAction.timespan = uint24(MAX_TIME - totalTimespan);
      }

      _addToQueue(from, _playerId, queuedAction, queueId, prevEndTime);
      unchecked {
        ++i;
        ++queueId;
      }
      totalTimespan += queuedAction.timespan;
      prevEndTime += queuedAction.timespan;
    } while (i < _queuedActions.length);

    emit SetActionQueue(_playerId, player.actionQueue);

    assert(totalTimespan <= MAX_TIME); // Should never happen
    latestQueueId = queueId;
  }

  function consumeBoost(uint _playerId, uint16 _itemTokenId, uint40 _startTime) public {
    PlayerBoostInfo storage playerBoost = activeBoosts[_playerId];

    Item memory item = itemNFT.getItem(_itemTokenId);
    require(item.boostType != BoostType.NONE); // , "Not a boost vial");
    require(_startTime < block.timestamp + 7 days); // , "Start time too far in the future");
    if (_startTime < block.timestamp) {
      _startTime = uint40(block.timestamp);
    }

    // Burn it
    address from = msg.sender;
    itemNFT.burn(from, _itemTokenId, 1);

    // If there's an active potion which hasn't been consumed yet, then we can mint it back
    if (playerBoost.itemTokenId != NONE) {
      itemNFT.mint(from, playerBoost.itemTokenId, 1);
    }

    playerBoost.startTime = _startTime;
    playerBoost.duration = item.boostDuration;
    playerBoost.val = item.boostValue;
    playerBoost.boostType = item.boostType;
    playerBoost.itemTokenId = _itemTokenId;

    emit ConsumeBoostVial(_playerId, playerBoost);
  }

  function _checkAddToQueue(QueuedAction memory _queuedAction) private view {
    if (_queuedAction.attire.ring != NONE) {
      revert UnsupportedAttire();
    }
    if (_queuedAction.attire.reserved1 != NONE) {
      revert UnsupportedAttire();
    }
    if (_queuedAction.choiceId1 != NONE) {
      revert UnsupportedAttire();
    }
    if (_queuedAction.choiceId2 != NONE) {
      revert UnsupportedAttire();
    }

    if (_queuedAction.regenerateId != NONE) {
      require(itemNFT.getItem(_queuedAction.regenerateId).equipPosition == EquipPosition.FOOD);
    }
  }

  function _addToQueue(
    address _from,
    uint _playerId,
    QueuedAction memory _queuedAction,
    uint128 _queueId,
    uint _startTime
  ) private {
    _checkAddToQueue(_queuedAction);
    Player storage _player = players[_playerId];

    uint16 actionId = _queuedAction.actionId;

    (
      uint16 handItemTokenIdRangeMin,
      uint16 handItemTokenIdRangeMax,
      bool actionChoiceRequired,
      Skill skill,
      uint32 actionMinSkillPoints,
      bool actionAvailable
    ) = world.getPermissibleItemsForAction(actionId);

    if (!actionAvailable) {
      revert ActionNotAvailable();
    }

    bool isCombat = skill == Skill.COMBAT;
    if (!isCombat && skillPoints[_playerId][skill] < actionMinSkillPoints) {
      revert MinimumSkillPointsNotReached();
    }

    // Check the actionChoice is valid
    ActionChoice memory actionChoice;
    if (actionChoiceRequired) {
      require(_queuedAction.choiceId != NONE);
      actionChoice = world.getActionChoice(isCombat ? NONE : _queuedAction.actionId, _queuedAction.choiceId);

      if (skillPoints[_playerId][actionChoice.skill] < actionChoice.minSkillPoints) {
        revert MinimumSkillPointsNotReached();
      }

      require(actionChoice.skill != Skill.NONE);
    }

    {
      // Check combatStyle is only selected if queuedAction is combat
      bool combatStyleSelected = _queuedAction.combatStyle != CombatStyle.NONE;
      require(isCombat == combatStyleSelected);
    }

    _checkHandEquipments(
      _from,
      _playerId,
      [_queuedAction.rightHandEquipmentTokenId, _queuedAction.leftHandEquipmentTokenId],
      handItemTokenIdRangeMin,
      handItemTokenIdRangeMax,
      isCombat
    );

    _checkActionConsumables(_from, _playerId, _queuedAction, actionChoice);

    _queuedAction.startTime = uint40(_startTime);
    _queuedAction.attire.queueId = _queueId;
    _queuedAction.isValid = true;
    _player.actionQueue.push(_queuedAction);

    _checkAttire(_from, _playerId, _player.actionQueue[_player.actionQueue.length - 1].attire);
  }

  function _checkActionConsumables(
    address _from,
    uint _playerId,
    QueuedAction memory _queuedAction,
    ActionChoice memory actionChoice
  ) private view {
    if (_queuedAction.choiceId != NONE) {
      // Get all items for this
      uint16[] memory itemTokenIds = new uint16[](4);
      uint itemLength;
      if (_queuedAction.regenerateId != NONE) {
        itemTokenIds[itemLength++] = _queuedAction.regenerateId;
      }
      if (actionChoice.inputTokenId1 != NONE) {
        itemTokenIds[itemLength++] = actionChoice.inputTokenId1;
      }
      if (actionChoice.inputTokenId2 != NONE) {
        itemTokenIds[itemLength++] = actionChoice.inputTokenId2;
      }
      if (actionChoice.inputTokenId3 != NONE) {
        itemTokenIds[itemLength++] = actionChoice.inputTokenId3;
      }
      assembly ("memory-safe") {
        mstore(itemTokenIds, itemLength)
      }
      if (itemLength != 0) {
        uint256[] memory balances = itemNFT.balanceOfs(_from, itemTokenIds);
        (Skill[] memory skills, uint32[] memory minSkillPoints) = itemNFT.getMinRequirements(itemTokenIds);
        uint i;
        while (i < balances.length) {
          if (skillPoints[_playerId][skills[i]] < minSkillPoints[i]) {
            revert MinimumSkillPointsNotReached();
          }

          if (balances[i] == 0) {
            revert NoItemBalance(itemTokenIds[i]);
          }
          unchecked {
            ++i;
          }
        }
      }
    }
    //     if (_queuedAction.choiceId1 != NONE) {
    //     if (_queuedAction.choiceId2 != NONE) {
  }

  // Checks they have sufficient balance to equip the items, and minimum skill points
  function _checkAttire(address _from, uint _playerId, Attire storage _attire) private view {
    // Check the user has these items
    bool skipNeck = false;
    (uint16[] memory itemTokenIds, uint[] memory balances) = _getAttireWithBalance(_from, _attire, skipNeck);
    if (itemTokenIds.length != 0) {
      (Skill[] memory skills, uint32[] memory minSkillPoints) = itemNFT.getMinRequirements(itemTokenIds);
      uint i;
      while (i < balances.length) {
        if (skillPoints[_playerId][skills[i]] < minSkillPoints[i]) {
          revert MinimumSkillPointsNotReached();
        }

        if (balances[i] == 0) {
          revert NoItemBalance(itemTokenIds[i]);
        }
        unchecked {
          ++i;
        }
      }
    }
  }

  function _isMainEquipped(uint _playerId, uint _itemTokenId) private view returns (bool) {
    EquipPosition position = _getMainEquipPosition(_itemTokenId);
    Player storage player = players[_playerId];
    uint equippedTokenId = _getEquippedTokenId(position, player);
    return equippedTokenId == _itemTokenId;
  }

  function _getMainEquipPosition(uint _itemTokenId) private pure returns (EquipPosition) {
    if (_itemTokenId >= MAX_MAIN_EQUIPMENT_ID) {
      return EquipPosition.NONE;
    }

    return EquipPosition(_itemTokenId / 65536);
  }

  function _getEquippedTokenId(
    EquipPosition _position,
    Player storage _player
  ) private view returns (uint16 equippedTokenId) {
    assembly ("memory-safe") {
      let val := sload(_player.slot)
      equippedTokenId := shr(mul(_position, 16), val)
    }
  }

  function _checkHandEquipments(
    address _from,
    uint _playerId,
    uint16[2] memory _equippedItemTokenIds, // right, left
    uint16 _handItemTokenIdRangeMin,
    uint16 _handItemTokenIdRangeMax,
    bool _isCombat
  ) private view {
    uint i;
    while (i < _equippedItemTokenIds.length) {
      bool isRightHand = i == 0;
      uint16 equippedItemTokenId = _equippedItemTokenIds[i];
      if (equippedItemTokenId != NONE) {
        if (
          _handItemTokenIdRangeMin != NONE &&
          (equippedItemTokenId < _handItemTokenIdRangeMin || equippedItemTokenId > _handItemTokenIdRangeMax)
        ) {
          revert InvalidArmEquipment(equippedItemTokenId);
        }

        uint256 balance = itemNFT.balanceOf(_from, equippedItemTokenId);
        if (balance == 0) {
          revert DoNotHaveEnoughQuantityToEquipToAction();
        }
        (Skill skill, uint32 minSkillPoints) = itemNFT.getMinRequirement(equippedItemTokenId);
        if (skillPoints[_playerId][skill] < minSkillPoints) {
          revert MinimumSkillPointsNotReached();
        }
      } else {
        // Only combat actions can have no equipment if they have hand range choice
        // e.g smithing doesn't require anything equipped
        require(_isCombat || _handItemTokenIdRangeMin == NONE || !isRightHand);
      }
      unchecked {
        ++i;
      }
    }
  }
}
