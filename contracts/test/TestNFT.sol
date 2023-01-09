//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../ItemNFT.sol";
import "../interfaces/IBrushToken.sol";
import "../World.sol";
import "../Users.sol";

contract TestItemNFT is ItemNFT {
  constructor(IBrushToken _brush, World _world, Users _users) ItemNFT(_brush, _world, _users) {}

  function testMint(
    address _to,
    uint256 _tokenId,
    uint256 _amount
  ) external {
    _mint(_to, _tokenId, _amount, "");
  }
}
