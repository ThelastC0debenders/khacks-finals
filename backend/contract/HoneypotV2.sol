// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HoneypotV2 {
    address public owner;
    bool public tradingOpen = false;
    uint256 public taxFee = 5;

    constructor() {
        owner = msg.sender;
    }

    // Suspicious: enableTrading (Risk: 20)
    function enableTrading() public {
        require(msg.sender == owner);
        tradingOpen = true;
    }

    // Suspicious: setFee (Risk: 25)
    function setFee(uint256 newFee) public {
        taxFee = newFee;
    }

    // Suspicious: mint (Risk: 60)
    function mint(address to, uint256 amount) public {
        // ... logic ...
    }

    // Suspicious: drain (Risk: 100)
    function drain() public {
        payable(owner).transfer(address(this).balance);
    }
}
