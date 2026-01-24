// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Malicious {
    address private _owner;
    mapping(address => bool) public blacklisted;

    constructor() {
        _owner = msg.sender;
    }

    // Suspicious function selector: f9f92be4
    function blacklist(address account) external {
        require(msg.sender == _owner, "Not owner");
        blacklisted[account] = true;
    }

    // Suspicious function selector: 8456cb59
    function pause() external {
        require(msg.sender == _owner, "Not owner");
    }

    // Suspicious function selector: 30e0789e
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(!blacklisted[sender], "Blacklisted");
    }

    function owner() public view returns (address) {
        return _owner;
    }
}
