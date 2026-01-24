
export interface ExecutionStep {
    opcode: string;
    pc: number;
    stack: string[];
    depth: number;
    memory?: string;
}

export interface TraceResult {
    steps: ExecutionStep[];
    events: string[];
    revertReason?: string;
    touchedStorage: Set<string>;
    usesMsgSender: boolean;
    usesTxOrigin: boolean;
    usesTimestamp: boolean;
    suspiciousJumps: number;
}

export class OpcodeTracer {
    private steps: ExecutionStep[] = [];
    private events: string[] = [];
    private touchedStorage = new Set<string>();
    private usesMsgSender = false;
    private usesTxOrigin = false;
    private usesTimestamp = false;
    private suspiciousJumps = 0;

    // Track state for pattern matching (simple state machine)
    private lastOpcode: string | null = null;
    private pushedSender = false;

    constructor() { }

    handleStep(data: any) {
        const opcode = data.opcode.name;
        const pc = data.pc;
        const depth = data.depth;

        // Capture stack (top 5 items for efficiency)
        const stack = data.stack ? data.stack.slice(-5).map((x: any) => x.toString(16)) : [];

        this.steps.push({
            opcode,
            pc,
            stack,
            depth
        });

        // Taint Analysis / Pattern Matching

        // 1. Sender Tracking
        if (opcode === 'CALLER') { // msg.sender
            this.usesMsgSender = true;
            this.pushedSender = true;
            this.events.push(`TAINT: msg.sender loaded at PC ${pc}`);
        } else if (opcode === 'ORIGIN') { // tx.origin
            this.usesTxOrigin = true;
            this.events.push(`TAINT: tx.origin loaded at PC ${pc}`);
        }

        // 2. Storage usage logic
        if (opcode === 'SLOAD') {
            const slot = stack[stack.length - 1]; // Top of stack is slot key
            this.touchedStorage.add(slot);
            if (this.pushedSender) {
                this.events.push(`CHECK: Storage read after Sender load - Potential Whitelist/Balance check`);
            }
        }

        // 3. Time usage logic
        if (opcode === 'TIMESTAMP') {
            this.usesTimestamp = true;
            this.events.push(`TAINT: block.timestamp loaded at PC ${pc}`);
        }

        // 4. Comparison Logic (EQ/LT/GT)
        if (['EQ', 'LT', 'GT', 'SGT', 'SLT'].includes(opcode)) {
            // If we just loaded sender or timestamp, this is a distinct check
            if (this.lastOpcode === 'CALLER' || this.lastOpcode === 'ORIGIN') {
                this.events.push(`CHECK: Comparing Sender address`);
            }
            if (this.lastOpcode === 'TIMESTAMP') {
                this.events.push(`CHECK: Comparing Timestamp`);
            }
        }

        // 5. Control Flow (JUMPI)
        if (opcode === 'JUMPI') {
            // If JUMPI happens after a critical check, it's a decision point
            // This is minimal; real taint analysis requires stack tracing
        }

        // Reset transient flags
        if (!['PUSH1', 'PUSH2', 'PUSH20', 'PUSH32', 'DUP1', 'DUP2'].includes(opcode)) {
            // Keep pushedSender tag alive only through direct data manipulation
            this.pushedSender = false;
        }

        this.lastOpcode = opcode;
    }

    getTrace(): TraceResult {
        return {
            steps: this.steps,
            events: this.events,
            touchedStorage: this.touchedStorage,
            usesMsgSender: this.usesMsgSender,
            usesTxOrigin: this.usesTxOrigin,
            usesTimestamp: this.usesTimestamp,
            suspiciousJumps: this.suspiciousJumps
        };
    }
}
