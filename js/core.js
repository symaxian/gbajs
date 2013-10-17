function ARMCore() {
	this.inherit();
	this.SP = 13;
	this.LR = 14;
	this.PC = 15;

	this.MODE_ARM = 0;
	this.MODE_THUMB = 1;

	this.MODE_USER = 0x10;
	this.MODE_FIQ = 0x11;
	this.MODE_IRQ = 0x12;
	this.MODE_SUPERVISOR = 0x13;
	this.MODE_ABORT = 0x17;
	this.MODE_UNDEFINED = 0x1B;
	this.MODE_SYSTEM = 0x1F;

	this.BANK_NONE = 0
	this.BANK_FIQ = 1;
	this.BANK_IRQ = 2;
	this.BANK_SUPERVISOR = 3;
	this.BANK_ABORT = 4;
	this.BANK_UNDEFINED = 5;

	this.UNALLOC_MASK = 0x0FFFFF00;
	this.USER_MASK = 0xF0000000;
	this.PRIV_MASK = 0x000000CF; // This is out of spec, but it seems to be what's done in other implementations
	this.STATE_MASK = 0x00000020;

	this.WORD_SIZE_ARM = 4;
	this.WORD_SIZE_THUMB = 2;

	this.BASE_RESET = 0x00000000;
	this.BASE_UNDEF = 0x00000004;
	this.BASE_SWI = 0x00000008;
	this.BASE_PABT = 0x0000000C;
	this.BASE_DABT = 0x00000010;
	this.BASE_IRQ = 0x00000018;
	this.BASE_FIQ = 0x0000001C;

	this.armCompiler = new ARMCoreArm(this);
	// this.thumbCompiler = new ARMCoreThumb(this);
	this.generateConds();

	this.gprs = new Int32Array(16);

}

ARMCore.prototype.resetCPU = function(startOffset) {
	for (var i = 0; i < this.PC; ++i) {
		this.gprs[i] = 0;
	}
	this.gprs[this.PC] = startOffset + this.WORD_SIZE_ARM;

	this.loadInstruction = this.loadInstructionArm;
	this.execMode = this.MODE_ARM;
	this.instructionWidth = this.WORD_SIZE_ARM;

	this.mode = this.MODE_SYSTEM;

	this.cpsrI = false;
	this.cpsrF = false;

	this.cpsrV = false;
	this.cpsrC = false;
	this.cpsrZ = false;
	this.cpsrN = false;

	this.bankedRegisters = [
		new Int32Array(7),
		new Int32Array(7),
		new Int32Array(2),
		new Int32Array(2),
		new Int32Array(2),
		new Int32Array(2)
	];
	this.spsr = 0;
	this.bankedSPSRs = new Int32Array(6);

	this.cycles = 0;

	this.shifterOperand = 0;
	this.shifterCarryOut = 0;

	this.page = null;
	this.pageId = 0;
	this.pageRegion = -1;

	this.instruction = null;

	this.irq.clear();

	this.interpretedCount = this.compiledCount = 0;

	var gprs = this.gprs;
	var mmu = this.mmu;

	this.step = function() {

		this.conditionPassed = true;

		// var instruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
		// gprs[this.PC] += this.instructionWidth;
		// this.execInstruction(instruction);

		var writesPC = this.loadInstruction(gprs[this.PC] - this.instructionWidth);

		if (!writesPC) {
			// if (this.instruction !== null) { // We might have gotten an interrupt from the instruction
			// 	if (nextInstruction === null || nextInstruction.page.invalid) {
			// 		// nextInstruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
			// 	}
			// 	// this.instruction = nextInstruction;
			// }
		} else {
			if (this.conditionPassed) {
				var pc = gprs[this.PC] &= 0xFFFFFFFE;
				if (this.execMode === this.MODE_ARM) {
					mmu.wait32(pc);
					mmu.waitPrefetch32(pc);
				} else {
					mmu.wait(pc);
					mmu.waitPrefetch(pc);
				}
				gprs[this.PC] += this.instructionWidth;
				// if (!instruction.fixedJump) {
				// 	this.instruction = null;
				// } else if (this.instruction !== null) {
				// 	if (nextInstruction === null || nextInstruction.page.invalid) {
				// 		// nextInstruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
				// 	}
				// 	// this.instruction = nextInstruction;
				// }
			}
			// else {
				// this.instruction = null;
			// }
		}
		this.irq.updateTimers();
	};

	this.stepOLD = function() {

		var nextInstruction = null;

		if(this.instruction === null){
			this.instruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
		}
		var instruction = this.instruction;
		gprs[this.PC] += this.instructionWidth;
		this.conditionPassed = true;

		// instruction();
		this.execInstruction(instruction);

		if (!instruction.writesPC) {
			if (this.instruction !== null) { // We might have gotten an interrupt from the instruction
				if (nextInstruction === null || nextInstruction.page.invalid) {
					nextInstruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
				}
				this.instruction = nextInstruction;
			}
		} else {
			if (this.conditionPassed) {
				var pc = gprs[this.PC] &= 0xFFFFFFFE;
				if (this.execMode === this.MODE_ARM) {
					mmu.wait32(pc);
					mmu.waitPrefetch32(pc);
				} else {
					mmu.wait(pc);
					mmu.waitPrefetch(pc);
				}
				gprs[this.PC] += this.instructionWidth;
				if (!instruction.fixedJump) {
					this.instruction = null;
				} else if (this.instruction !== null) {
					if (nextInstruction === null || nextInstruction.page.invalid) {
						nextInstruction = this.loadInstruction(gprs[this.PC] - this.instructionWidth);
					}
					this.instruction = nextInstruction;
				}
			} else {
				this.instruction = null;
			}
		}
		this.irq.updateTimers();
	};

};

ARMCore.prototype.freeze = function() {
	return {
		'gprs': [
			this.gprs[0],
			this.gprs[1],
			this.gprs[2],
			this.gprs[3],
			this.gprs[4],
			this.gprs[5],
			this.gprs[6],
			this.gprs[7],
			this.gprs[8],
			this.gprs[9],
			this.gprs[10],
			this.gprs[11],
			this.gprs[12],
			this.gprs[13],
			this.gprs[14],
			this.gprs[15],
		],
		'mode': this.mode,
		'cpsrI': this.cpsrI,
		'cpsrF': this.cpsrF,
		'cpsrV': this.cpsrV,
		'cpsrC': this.cpsrC,
		'cpsrZ': this.cpsrZ,
		'cpsrN': this.cpsrN,
		'bankedRegisters': [
			[
				this.bankedRegisters[0][0],
				this.bankedRegisters[0][1],
				this.bankedRegisters[0][2],
				this.bankedRegisters[0][3],
				this.bankedRegisters[0][4],
				this.bankedRegisters[0][5],
				this.bankedRegisters[0][6]
			],
			[
				this.bankedRegisters[1][0],
				this.bankedRegisters[1][1],
				this.bankedRegisters[1][2],
				this.bankedRegisters[1][3],
				this.bankedRegisters[1][4],
				this.bankedRegisters[1][5],
				this.bankedRegisters[1][6]
			],
			[
				this.bankedRegisters[2][0],
				this.bankedRegisters[2][1]
			],
			[
				this.bankedRegisters[3][0],
				this.bankedRegisters[3][1]
			],
			[
				this.bankedRegisters[4][0],
				this.bankedRegisters[4][1]
			],
			[
				this.bankedRegisters[5][0],
				this.bankedRegisters[5][1]
			]
		],
		'spsr': this.spsr,
		'bankedSPSRs': [
			this.bankedSPSRs[0],
			this.bankedSPSRs[1],
			this.bankedSPSRs[2],
			this.bankedSPSRs[3],
			this.bankedSPSRs[4],
			this.bankedSPSRs[5]
		],
		'cycles': this.cycles
	};
};

ARMCore.prototype.defrost = function(frost) {
	this.instruction = null;

	this.page = null;
	this.pageId = 0;
	this.pageRegion = -1;

	this.gprs[0] = frost.gprs[0];
	this.gprs[1] = frost.gprs[1];
	this.gprs[2] = frost.gprs[2];
	this.gprs[3] = frost.gprs[3];
	this.gprs[4] = frost.gprs[4];
	this.gprs[5] = frost.gprs[5];
	this.gprs[6] = frost.gprs[6];
	this.gprs[7] = frost.gprs[7];
	this.gprs[8] = frost.gprs[8];
	this.gprs[9] = frost.gprs[9];
	this.gprs[10] = frost.gprs[10];
	this.gprs[11] = frost.gprs[11];
	this.gprs[12] = frost.gprs[12];
	this.gprs[13] = frost.gprs[13];
	this.gprs[14] = frost.gprs[14];
	this.gprs[15] = frost.gprs[15];

	this.mode = frost.mode;
	this.cpsrI = frost.cpsrI;
	this.cpsrF = frost.cpsrF;
	this.cpsrV = frost.cpsrV;
	this.cpsrC = frost.cpsrC;
	this.cpsrZ = frost.cpsrZ;
	this.cpsrN = frost.cpsrN;

	this.bankedRegisters[0][0] = frost.bankedRegisters[0][0];
	this.bankedRegisters[0][1] = frost.bankedRegisters[0][1];
	this.bankedRegisters[0][2] = frost.bankedRegisters[0][2];
	this.bankedRegisters[0][3] = frost.bankedRegisters[0][3];
	this.bankedRegisters[0][4] = frost.bankedRegisters[0][4];
	this.bankedRegisters[0][5] = frost.bankedRegisters[0][5];
	this.bankedRegisters[0][6] = frost.bankedRegisters[0][6];

	this.bankedRegisters[1][0] = frost.bankedRegisters[1][0];
	this.bankedRegisters[1][1] = frost.bankedRegisters[1][1];
	this.bankedRegisters[1][2] = frost.bankedRegisters[1][2];
	this.bankedRegisters[1][3] = frost.bankedRegisters[1][3];
	this.bankedRegisters[1][4] = frost.bankedRegisters[1][4];
	this.bankedRegisters[1][5] = frost.bankedRegisters[1][5];
	this.bankedRegisters[1][6] = frost.bankedRegisters[1][6];

	this.bankedRegisters[2][0] = frost.bankedRegisters[2][0];
	this.bankedRegisters[2][1] = frost.bankedRegisters[2][1];

	this.bankedRegisters[3][0] = frost.bankedRegisters[3][0];
	this.bankedRegisters[3][1] = frost.bankedRegisters[3][1];

	this.bankedRegisters[4][0] = frost.bankedRegisters[4][0];
	this.bankedRegisters[4][1] = frost.bankedRegisters[4][1];

	this.bankedRegisters[5][0] = frost.bankedRegisters[5][0];
	this.bankedRegisters[5][1] = frost.bankedRegisters[5][1];

	this.spsr = frost.spsr;
	this.bankedSPSRs[0] = frost.bankedSPSRs[0];
	this.bankedSPSRs[1] = frost.bankedSPSRs[1];
	this.bankedSPSRs[2] = frost.bankedSPSRs[2];
	this.bankedSPSRs[3] = frost.bankedSPSRs[3];
	this.bankedSPSRs[4] = frost.bankedSPSRs[4];
	this.bankedSPSRs[5] = frost.bankedSPSRs[5];

	this.cycles = frost.cycles;
};

ARMCore.prototype.fetchPage = function(address) {
	var region = address >> this.mmu.BASE_OFFSET;
	var pageId = this.mmu.addressToPage(region, address & this.mmu.OFFSET_MASK);
	if (region === this.pageRegion) {
		if (pageId === this.pageId && !this.page.invalid) {
			return;
		}
		this.pageId = pageId;
	} else {
		this.pageMask = this.mmu.memory[region].PAGE_MASK;
		this.pageRegion = region;
		this.pageId = pageId;
	}

	this.page = this.mmu.accessPage(region, pageId);
};

ARMCore.prototype.loadInstructionArm = function(address) {
	// var instruction = null;
	// this.fetchPage(address);
	// var offset = (address & this.pageMask) >> 2;
	// instruction = this.page.arm[offset];
	// if (instruction) {
	// 	return instruction;
	// }
	// var opcode = this.mmu.load32(address) >>> 0;
	// instruction = this.compileArm(opcode);
	// // instruction.next = null;
	// instruction.page = this.page;
	// instruction.address = address;
	// instruction.opcode = opcode;
	// this.page.arm[offset] = instruction;
	// return instruction;
	// return {
	// 	command: this.compileArm(opcode),
	// 	address: address,
	// 	opcode: opcode
	// };
	return this.compileArm(this.mmu.load32(address) >>> 0, address);
};

ARMCore.prototype.loadInstructionThumb = function(address) {
	// var instruction = null;
	// this.fetchPage(address);
	// var offset = (address & this.pageMask) >> 1;
	// instruction = this.page.thumb[offset];
	// if (instruction) {
	// 	return instruction;
	// }
	// var opcode = this.mmu.load16(address);
	// instruction = this.compileThumb(opcode);
	// // instruction.next = null;
	// instruction.page = this.page;
	// instruction.address = address;
	// instruction.opcode = opcode;
	// this.page.thumb[offset] = instruction;
	// return instruction;
	// return {
	// 	command: this.compileThumb(opcode),
	// 	address: address,
	// 	opcode: opcode
	// };
	return this.compileThumb(this.mmu.load16(address), address);
};

ARMCore.prototype.selectBank = function(mode) {
	switch (mode) {
	case this.MODE_USER:
	case this.MODE_SYSTEM:
		// No banked registers
		return this.BANK_NONE;
	case this.MODE_FIQ:
		return this.BANK_FIQ;
	case this.MODE_IRQ:
		return this.BANK_IRQ;
	case this.MODE_SUPERVISOR:
		return this.BANK_SUPERVISOR;
	case this.MODE_ABORT:
		return this.BANK_ABORT;
	case this.MODE_UNDEFINED:
		return this.BANK_UNDEFINED;
	default:
		throw "Invalid user mode passed to selectBank";
	}
};

ARMCore.prototype.switchExecMode = function(newMode) {
	if (this.execMode !== newMode) {
		this.execMode = newMode;
		if (newMode === this.MODE_ARM) {
			this.instructionWidth = this.WORD_SIZE_ARM;
			this.loadInstruction = this.loadInstructionArm;
		} else {
			this.instructionWidth = this.WORD_SIZE_THUMB;
			this.loadInstruction = this.loadInstructionThumb;
		}
	}
};

ARMCore.prototype.switchMode = function(newMode) {
	if (newMode === this.mode) {
		// Not switching modes after all
		return;
	}
	if (newMode !== this.MODE_USER || newMode !== this.MODE_SYSTEM) {
		// Switch banked registers
		var newBank = this.selectBank(newMode);
		var oldBank = this.selectBank(this.mode);
		if (newBank !== oldBank) {
			// TODO: support FIQ
			if (newMode === this.MODE_FIQ || this.mode === this.MODE_FIQ) {
				var oldFiqBank = (oldBank === this.BANK_FIQ) + 0;
				var newFiqBank = (newBank === this.BANK_FIQ) + 0;
				this.bankedRegisters[oldFiqBank][2] = this.gprs[8];
				this.bankedRegisters[oldFiqBank][3] = this.gprs[9];
				this.bankedRegisters[oldFiqBank][4] = this.gprs[10];
				this.bankedRegisters[oldFiqBank][5] = this.gprs[11];
				this.bankedRegisters[oldFiqBank][6] = this.gprs[12];
				this.gprs[8] = this.bankedRegisters[newFiqBank][2];
				this.gprs[9] = this.bankedRegisters[newFiqBank][3];
				this.gprs[10] = this.bankedRegisters[newFiqBank][4];
				this.gprs[11] = this.bankedRegisters[newFiqBank][5];
				this.gprs[12] = this.bankedRegisters[newFiqBank][6];
			}
			this.bankedRegisters[oldBank][0] = this.gprs[this.SP];
			this.bankedRegisters[oldBank][1] = this.gprs[this.LR];
			this.gprs[this.SP] = this.bankedRegisters[newBank][0];
			this.gprs[this.LR] = this.bankedRegisters[newBank][1];

			this.bankedSPSRs[oldBank] = this.spsr;
			this.spsr = this.bankedSPSRs[newBank];
		}
	}
	this.mode = newMode;
};

ARMCore.prototype.packCPSR = function() {
	return this.mode | (!!this.execMode << 5) | (!!this.cpsrF << 6) | (!!this.cpsrI << 7) |
	       (!!this.cpsrN << 31) | (!!this.cpsrZ << 30) | (!!this.cpsrC << 29) | (!!this.cpsrV << 28);
};

ARMCore.prototype.unpackCPSR = function(spsr) {
	this.switchMode(spsr & 0x0000001F);
	this.switchExecMode(!!(spsr & 0x00000020));
	this.cpsrF = spsr & 0x00000040;
	this.cpsrI = spsr & 0x00000080;
	this.cpsrN = spsr & 0x80000000;
	this.cpsrZ = spsr & 0x40000000;
	this.cpsrC = spsr & 0x20000000;
	this.cpsrV = spsr & 0x10000000;

	this.irq.testIRQ();
};

ARMCore.prototype.hasSPSR = function() {
	return this.mode !== this.MODE_SYSTEM && this.mode !== this.MODE_USER;
};

ARMCore.prototype.raiseIRQ = function() {
	if (this.cpsrI) {
		return;
	}
	var cpsr = this.packCPSR();
	var instructionWidth = this.instructionWidth;
	this.switchMode(this.MODE_IRQ);
	this.spsr = cpsr;
	this.gprs[this.LR] = this.gprs[this.PC] - instructionWidth + 4;
	this.gprs[this.PC] = this.BASE_IRQ + this.WORD_SIZE_ARM;
	this.instruction = null;
	this.switchExecMode(this.MODE_ARM);
	this.cpsrI = true;
};

ARMCore.prototype.raiseTrap = function() {
	var cpsr = this.packCPSR();
	var instructionWidth = this.instructionWidth;
	this.switchMode(this.MODE_SUPERVISOR);
	this.spsr = cpsr;
	this.gprs[this.LR] = this.gprs[this.PC] - instructionWidth;
	this.gprs[this.PC] = this.BASE_SWI + this.WORD_SIZE_ARM;
	this.instruction = null;
	this.switchExecMode(this.MODE_ARM);
	this.cpsrI = true;
};

ARMCore.prototype.badOp = function(instruction) {
	var func = function() {
		throw "Illegal instruction: 0x" + instruction.toString(16);
	};
	func.writesPC = true;
	return func;
};

ARMCore.prototype.generateConds = function() {
	var cpu = this;
	this.conds = [
		// EQ
		function() {
			return cpu.conditionPassed = cpu.cpsrZ;
		},
		// NE
		function() {
			return cpu.conditionPassed = !cpu.cpsrZ;
		},
		// CS
		function() {
			return cpu.conditionPassed = cpu.cpsrC;
		},
		// CC
		function() {
			return cpu.conditionPassed = !cpu.cpsrC;
		},
		// MI
		function() {
			return cpu.conditionPassed = cpu.cpsrN;
		},
		// PL
		function() {
			return cpu.conditionPassed = !cpu.cpsrN;
		},
		// VS
		function() {
			return cpu.conditionPassed = cpu.cpsrV;
		},
		// VC
		function() {
			return cpu.conditionPassed = !cpu.cpsrV;
		},
		// HI
		function() {
			return cpu.conditionPassed = cpu.cpsrC && !cpu.cpsrZ;
		},
		// LS
		function() {
			return cpu.conditionPassed = !cpu.cpsrC || cpu.cpsrZ;
		},
		// GE
		function() {
			return cpu.conditionPassed = !cpu.cpsrN === !cpu.cpsrV;
		},
		// LT
		function() {
			return cpu.conditionPassed = !cpu.cpsrN !== !cpu.cpsrV;
		},
		// GT
		function() {
			return cpu.conditionPassed = !cpu.cpsrZ && !cpu.cpsrN === !cpu.cpsrV;
		},
		// LE
		function() {
			return cpu.conditionPassed = cpu.cpsrZ || !cpu.cpsrN !== !cpu.cpsrV;
		},
		// AL
		null,
		null
	]
};

ARMCore.prototype.barrelShiftImmediate = function(shiftType, immediate, rm) {
	var cpu = this;
	var gprs = this.gprs;
	var shiftOp = this.badOp;
	switch (shiftType) {
	case 0x00000000:
		// LSL
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] << immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (32 - immediate));
			};
		} else {
			// This boils down to no shift
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm];
				cpu.shifterCarryOut = cpu.cpsrC;
			};
		}
		break;
	case 0x00000020:
		// LSR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] >>> immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			shiftOp = function() {
				cpu.shifterOperand = 0;
				cpu.shifterCarryOut = gprs[rm] & 0x80000000;
			};
		}
		break;
	case 0x00000040:
		// ASR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = gprs[rm] >> immediate;
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			shiftOp = function() {
				cpu.shifterCarryOut = gprs[rm] & 0x80000000;
				if (cpu.shifterCarryOut) {
					cpu.shifterOperand = 0xFFFFFFFF;
				} else {
					cpu.shifterOperand = 0;
				}
			};
		}
		break;
	case 0x00000060:
		// ROR
		if (immediate) {
			shiftOp = function() {
				cpu.shifterOperand = (gprs[rm] >>> immediate) | (gprs[rm] << (32 - immediate));
				cpu.shifterCarryOut = gprs[rm] & (1 << (immediate - 1));
			};
		} else {
			// RRX
			shiftOp = function() {
				cpu.shifterOperand = (!!cpu.cpsrC << 31) | (gprs[rm] >>> 1);
				cpu.shifterCarryOut =  gprs[rm] & 0x00000001;
			};
		}
		break;
	}
	return shiftOp;
};

ARMCore.prototype.compileArm = function(instruction, address) {
	var op = this.badOp(instruction);
	var i = instruction & 0x0E000000;
	var cpu = this;
	var gprs = this.gprs;

	var writesPC = op.writesPC;
	var interpret = false;

	var condOp = this.conds[(instruction & 0xF0000000) >>> 28];
	var condOpIndex = (instruction & 0xF0000000) >>> 28;

	if ((instruction & 0x0FFFFFF0) === 0x012FFF10) {
		// BX
		var rm = instruction & 0xF;
		// op = this.armCompiler.constructBX(rm, condOp);
		
		interpret = true;
		gprs[this.PC] += this.instructionWidth;
		this.armCompiler.runBX(this, rm, condOpIndex);
		
		writesPC = true;
	} else if (!(instruction & 0x0C000000) && (i === 0x02000000 || (instruction & 0x00000090) !== 0x00000090)) {
		var opcode = instruction & 0x01E00000;
		var s = instruction & 0x00100000;
		var shiftsRs = false;
		if ((opcode & 0x01800000) === 0x01000000 && !s) {
			var r = instruction & 0x00400000;
			if ((instruction & 0x00B0F000) === 0x0020F000) {
				// MSR
				var rm = instruction & 0x0000000F;
				var immediate = instruction & 0x000000FF;
				var rotateImm = (instruction & 0x00000F00) >> 7;
				immediate = (immediate >>> rotateImm) | (immediate << (32 - rotateImm));
				op = this.armCompiler.constructMSR(rm, r, instruction, immediate, condOp);
				writesPC = false;
			} else if ((instruction & 0x00BF0000) === 0x000F0000) {
				// MRS
				var rd = (instruction & 0x0000F000) >> 12;
				op = this.armCompiler.constructMRS(rd, r, condOp);
				writesPC = rd === this.PC;
			}
		} else {
			// Data processing/FSR transfer
			var rn = (instruction & 0x000F0000) >> 16;
			var rd = (instruction & 0x0000F000) >> 12;

			// Parse shifter operand
			var shiftType = instruction & 0x00000060;
			var rm = instruction & 0x0000000F;
			var shiftOp = function() {
				throw 'BUG: invalid barrel shifter';
			};
			if (instruction & 0x02000000) {
				var immediate = instruction & 0x000000FF;
				var rotate = (instruction & 0x00000F00) >> 7;
				if (!rotate) {
					shiftOp = this.armCompiler.constructAddressingMode1Immediate(immediate);
				} else {
					shiftOp = this.armCompiler.constructAddressingMode1ImmediateRotate(immediate, rotate);
				}
			} else if (instruction & 0x00000010) {
				var rs = (instruction & 0x00000F00) >> 8;
				shiftsRs = true;
				switch (shiftType) {
				case 0x00000000:
					// LSL
					shiftOp = this.armCompiler.constructAddressingMode1LSL(rs, rm);
					break;
				case 0x00000020:
					// LSR
					shiftOp = this.armCompiler.constructAddressingMode1LSR(rs, rm);
					break;
				case 0x00000040:
					// ASR
					shiftOp = this.armCompiler.constructAddressingMode1ASR(rs, rm);
					break;
				case 0x00000060:
					// ROR
					shiftOp = this.armCompiler.constructAddressingMode1ROR(rs, rm);
					break;
				}
			} else {
				var immediate = (instruction & 0x00000F80) >> 7;
				shiftOp = this.barrelShiftImmediate(shiftType, immediate, rm);
			}

			interpret = true;
			gprs[this.PC] += this.instructionWidth;

			this.armCompiler.run(this, opcode, s, rd, rn, condOpIndex, shiftOp);

			writesPC = rd === this.PC;

		}
	} else if ((instruction & 0x0FB00FF0) === 0x01000090) {
		// Single data swap
		var rm = instruction & 0x0000000F;
		var rd = (instruction >> 12) & 0x0000000F;
		var rn = (instruction >> 16) & 0x0000000F;
		if (instruction & 0x00400000) {
			op = this.armCompiler.constructSWPB(rd, rn, rm, condOp);
		} else {
			op = this.armCompiler.constructSWP(rd, rn, rm, condOp);
		}
		writesPC = rd === this.PC;
	} else {
		switch (i) {
		case 0x00000000:
			if ((instruction & 0x010000F0) === 0x00000090) {
				// Multiplies
				var rd = (instruction & 0x000F0000) >> 16;
				var rn = (instruction & 0x0000F000) >> 12;
				var rs = (instruction & 0x00000F00) >> 8;
				var rm = instruction & 0x0000000F;
				var opcode = instruction & 0x00F00000;

				interpret = true;
				gprs[this.PC] += this.instructionWidth;

				this.armCompiler.runMul(this, opcode, rd, rn, rs, rm, condOpIndex);

				// switch (instruction & 0x00F00000) {
				// case 0x00000000:
				// 	// MUL
				// 	op = this.armCompiler.constructMUL(rd, rs, rm, condOp);
				// 	break;
				// case 0x00100000:
				// 	// MULS
				// 	op = this.armCompiler.constructMULS(rd, rs, rm, condOp);
				// 	break;
				// case 0x00200000:
				// 	// MLA
				// 	op = this.armCompiler.constructMLA(rd, rn, rs, rm, condOp);
				// 	break
				// case 0x00300000:
				// 	// MLAS
				// 	op = this.armCompiler.constructMLAS(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00800000:
				// 	// UMULL
				// 	op = this.armCompiler.constructUMULL(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00900000:
				// 	// UMULLS
				// 	op = this.armCompiler.constructUMULLS(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00A00000:
				// 	// UMLAL
				// 	op = this.armCompiler.constructUMLAL(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00B00000:
				// 	// UMLALS
				// 	op = this.armCompiler.constructUMLALS(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00C00000:
				// 	// SMULL
				// 	op = this.armCompiler.constructSMULL(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00D00000:
				// 	// SMULLS
				// 	op = this.armCompiler.constructSMULLS(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00E00000:
				// 	// SMLAL
				// 	op = this.armCompiler.constructSMLAL(rd, rn, rs, rm, condOp);
				// 	break;
				// case 0x00F00000:
				// 	// SMLALS
				// 	op = this.armCompiler.constructSMLALS(rd, rn, rs, rm, condOp);
				// 	break;
				// }

				writesPC = rd === this.PC;

			} else {
				// Halfword and signed byte data transfer
				var load = instruction & 0x00100000;
				var rd = (instruction & 0x0000F000) >> 12;
				var hiOffset = (instruction & 0x00000F00) >> 4;
				var loOffset = rm = instruction & 0x0000000F;
				var h = instruction & 0x00000020;
				var s = instruction & 0x00000040;
				var w = instruction & 0x00200000;
				var i = instruction & 0x00400000;

				var address;
				if (i) {
					var immediate = loOffset | hiOffset;
					address = this.armCompiler.constructAddressingMode23Immediate(instruction, immediate, condOp);
				} else {
					address = this.armCompiler.constructAddressingMode23Register(instruction, rm, condOp);
				}
				address.writesPC = !!w && rn === this.PC;

				if ((instruction & 0x00000090) === 0x00000090) {
					if (load) {
						// Load [signed] halfword/byte
						if (h) {
							if (s) {
								// LDRSH
								op = this.armCompiler.constructLDRSH(rd, address, condOp);
							} else {
								// LDRH
								op = this.armCompiler.constructLDRH(rd, address, condOp);
							}
						} else {
							if (s) {
								// LDRSB
								op = this.armCompiler.constructLDRSB(rd, address, condOp);
							}
						}
					} else if (!s && h) {
						// STRH
						op = this.armCompiler.constructSTRH(rd, address, condOp);
					}
				}
				writesPC = rd === this.PC || address.writesPC;
			}
			break;
		case 0x04000000:
		case 0x06000000:
			// LDR/STR
			var rd = (instruction & 0x0000F000) >> 12;
			var load = instruction & 0x00100000;
			var b = instruction & 0x00400000;
			var i = instruction & 0x02000000;

			var address = function() {
				throw "Unimplemented memory access: 0x" + instruction.toString(16);
			};
			if (~instruction & 0x01000000) {
				// Clear the W bit if the P bit is clear--we don't support memory translation, so these turn into regular accesses
				instruction &= 0xFFDFFFFF;
			}
			if (i) {
				// Register offset
				var rm = instruction & 0x0000000F;
				var shiftType = instruction & 0x00000060;
				var shiftImmediate = (instruction & 0x00000F80) >> 7;
				
				if (shiftType || shiftImmediate) {
					var shiftOp = this.barrelShiftImmediate(shiftType, shiftImmediate, rm);
					address = this.armCompiler.constructAddressingMode2RegisterShifted(instruction, shiftOp, condOp);
				} else {
					address = this.armCompiler.constructAddressingMode23Register(instruction, rm, condOp);
				}
			} else {
				// Immediate
				var offset = instruction & 0x00000FFF;
				address = this.armCompiler.constructAddressingMode23Immediate(instruction, offset, condOp);
			}
			if (load) {
				if (b) {
					// LDRB
					op = this.armCompiler.constructLDRB(rd, address, condOp);
				} else {
					// LDR
					op = this.armCompiler.constructLDR(rd, address, condOp);
				}
			} else {
				if (b) {
					// STRB
					op = this.armCompiler.constructSTRB(rd, address, condOp);
				} else {
					// STR
					op = this.armCompiler.constructSTR(rd, address, condOp);
				}
			}
			writesPC = rd === this.PC || address.writesPC;
			break;
		case 0x08000000:
			// Block data transfer
			var load = instruction & 0x00100000;
			var w = instruction & 0x00200000;
			var user = instruction & 0x00400000;
			var u = instruction & 0x00800000;
			var p = instruction & 0x01000000;
			var rs = instruction & 0x0000FFFF;
			var rn = (instruction & 0x000F0000) >> 16;

			var address;
			var immediate = 0;
			var offset = 0;
			var overlap = false;
			if (u) {
				if (p) {
					immediate = 4;
				}
				for (var m = 0x01, i = 0; i < 16; m <<= 1, ++i) {
					if (rs & m) {
						if (w && i === rn && !offset) {
							rs &= ~m;
							immediate += 4;
							overlap = true;
						}
						offset += 4;
					}
				}
			} else {
				if (!p) {
					immediate = 4;
				}
				for (var m = 0x01, i = 0; i < 16; m <<= 1, ++i) {
					if (rs & m) {
						if (w && i === rn && !offset) {
							rs &= ~m;
							immediate += 4;
							overlap = true;
						}
						immediate -= 4;
						offset -= 4;
					}
				}
			}
			if (w) {
				address = this.armCompiler.constructAddressingMode4Writeback(immediate, offset, rn, overlap);
			} else {
				address = this.armCompiler.constructAddressingMode4(immediate, rn);
			}
			if (load) {
				// LDM
				if (user) {
					op = this.armCompiler.constructLDMS(rs, address, condOp);
				} else {
					op = this.armCompiler.constructLDM(rs, address, condOp);
				}
				writesPC = !!(rs & (1 << 15));
			} else {
				// STM
				if (user) {
					op = this.armCompiler.constructSTMS(rs, address, condOp);
				} else {
					op = this.armCompiler.constructSTM(rs, address, condOp);
				}
				writesPC = false;
			}
			break;
		case 0x0A000000:
			// Branch
			var immediate = instruction & 0x00FFFFFF;
			if (immediate & 0x00800000) {
				immediate |= 0xFF000000;
			}
			immediate <<= 2;
			var link = instruction & 0x01000000;
			if (link) {
				op = this.armCompiler.constructBL(immediate, condOp);
			} else {
				op = this.armCompiler.constructB(immediate, condOp);
			}
			writesPC = true;
			break;
		case 0x0C000000:
			// Coprocessor data transfer
			break;
		case 0x0E000000:
			// Coprocessor data operation/SWI
			if ((instruction & 0x0F000000) === 0x0F000000) {
				// SWI
				var immediate = (instruction & 0x00FFFFFF);
				op = this.armCompiler.constructSWI(immediate, condOp);
				writesPC = false;
			}
			break;
		default:
			throw 'Bad opcode: 0x' + instruction.toString(16);
		}
	}

	if(interpret){
		// The instruction has already been interpreted, so just increment the count and return
		this.interpretedCount++;
	}
	else{
		gprs[this.PC] += this.instructionWidth;
		op();
		this.compiledCount++;
	}

	return writesPC;

};

ARMCore.prototype.compileThumb = function(instruction, address) {

	var op = this.badOp(instruction & 0xFFFF);
	// var op = function(){ console.log(!(instruction & 0xE000) === 0x1800); throw "HALP" };
	var cpu = this;
	var gprs = this.gprs;
	var writesPC = op.writesPC;
	var interpret = false;

	if ((instruction & 0xFC00) === 0x4000) {

		// Data-processing register

		var rm = (instruction & 0x0038) >> 3;
		var rd = instruction & 0x0007;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
	
		// Switch on the opcode
		switch (instruction & 0x03C0) {

			// AND
			case 0x0000:
				gprs[rd] = gprs[rd] & gprs[rm];
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// EOR
			case 0x0040:
				gprs[rd] = gprs[rd] ^ gprs[rm];
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;
		

			// LSL(2)
			case 0x0080:
				var rs = gprs[rm] & 0xFF;
				if (rs) {
					if (rs < 32) {
						cpu.cpsrC = gprs[rd] & (1 << (32 - rs));
						gprs[rd] <<= rs;
					} else {
						if (rs > 32) {
							cpu.cpsrC = 0;
						} else {
							cpu.cpsrC = gprs[rd] & 0x00000001;
						}
						gprs[rd] = 0;
					}
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;
			
			// LSR(2)
			case 0x00C0:
				var rs = gprs[rm] & 0xFF;
				if (rs) {
					if (rs < 32) {
						cpu.cpsrC = gprs[rd] & (1 << (rs - 1));
						gprs[rd] >>>= rs;
					} else {
						if (rs > 32) {
							cpu.cpsrC = 0;
						} else {
							cpu.cpsrC = gprs[rd] >> 31;
						}
						gprs[rd] = 0;
					}
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// ASR(2)
			case 0x0100:
				var rs = gprs[rm] & 0xFF;
				if (rs) {
					if (rs < 32) {
						cpu.cpsrC = gprs[rd] & (1 << (rs - 1));
						gprs[rd] >>= rs;
					} else {
						cpu.cpsrC = gprs[rd] >> 31;
						if (cpu.cpsrC) {
							gprs[rd] = 0xFFFFFFFF;
						} else {
							gprs[rd] = 0;
						}
					}
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;
			
			// ADC
			case 0x0140:
				var m = (gprs[rm] >>> 0) + !!cpu.cpsrC;
				var oldD = gprs[rd];
				var d = (oldD >>> 0) + m;
				var oldDn = oldD >> 31;
				var dn = d >> 31;
				var mn = m >> 31;
				cpu.cpsrN = dn;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = d > 0xFFFFFFFF;
				cpu.cpsrV = oldDn === mn && oldDn != dn && mn != dn;
				gprs[rd] = d;
				break;

			// SBC
			case 0x0180:
				var m = (gprs[rm] >>> 0) + !cpu.cpsrC;
				var d = (gprs[rd] >>> 0) - m;
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rd] >>> 0) >= (d >>> 0);
				cpu.cpsrV = ((gprs[rd] ^ m) >> 31) && ((gprs[rd] ^ d) >> 31);
				gprs[rd] = d;
				break;

			// ROR
			case 0x01C0:
				var rs = gprs[rm] & 0xFF;
				if (rs) {
					var r4 = rs & 0x1F;
					if (r4 > 0) {
						cpu.cpsrC = gprs[rd] & (1 << (r4 - 1));
						gprs[rd] = (gprs[rd] >>> r4) | (gprs[rd] << (32 - r4));
					} else {
						cpu.cpsrC = gprs[rd] >> 31;
					}
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// TST
			case 0x0200:
				var aluOut = gprs[rd] & gprs[rm];
				cpu.cpsrN = aluOut >> 31;
				cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
				break;

			// NEG
			case 0x0240:
				var d = -gprs[rm];
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = 0 >= (d >>> 0);
				cpu.cpsrV = (gprs[rm] >> 31) && (d >> 31);
				gprs[rd] = d;
				break;

			// CMP(2)
			case 0x0280:
				var d = gprs[rd];
				var m = gprs[rm];
				var aluOut = d - m;
				var an = aluOut >> 31;
				var dn = d >> 31;
				cpu.cpsrN = an;
				cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
				cpu.cpsrC = (d >>> 0) >= (m >>> 0);
				cpu.cpsrV = dn != (m >> 31) && dn != an;
				break;
			
			// CMN
			case 0x02C0:
				var aluOut = (gprs[rd] >>> 0) + (gprs[rm] >>> 0);
				cpu.cpsrN = aluOut >> 31;
				cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
				cpu.cpsrC = aluOut > 0xFFFFFFFF;
				cpu.cpsrV = (gprs[rd] >> 31) === (gprs[rm] >> 31) &&
							(gprs[rd] >> 31) != (aluOut >> 31) &&
							(gprs[rm] >> 31) != (aluOut >> 31);
				break;

			// ORR
			case 0x0300:
				gprs[rd] = gprs[rd] | gprs[rm];
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// MUL
			case 0x0340:
				cpu.mmu.waitMul(gprs[rm]);
				if ((gprs[rm] & 0xFFFF0000) && (gprs[rd] & 0xFFFF0000)) {
					// Our data type is a double--we'll lose bits if we do it all at once!
					var hi = ((gprs[rd] & 0xFFFF0000) * gprs[rm]) & 0xFFFFFFFF;
					var lo = ((gprs[rd] & 0x0000FFFF) * gprs[rm]) & 0xFFFFFFFF;
					gprs[rd] = (hi + lo) & 0xFFFFFFFF;
				}
				else {
					gprs[rd] *= gprs[rm];
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// BIC
			case 0x0380:
				gprs[rd] = gprs[rd] & ~gprs[rm];
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// MVN
			case 0x03C0:
				gprs[rd] = ~gprs[rm];
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;
		
		}

		writesPC = false;

	}
	else if ((instruction & 0xFC00) === 0x4400) {

		// Special data processing / branch/exchange instruction set

		var rm = (instruction & 0x0078) >> 3;
		var rn = instruction & 0x0007;
		var h1 = instruction & 0x0080;
		var rd = rn | (h1 >> 4);

		interpret = true;

		// Switch on the opcode
		switch (instruction & 0x0300) {

			// ADD(4)
			case 0x0000:
				writesPC = rd === cpu.PC;
				gprs[cpu.PC] += this.instructionWidth;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] += gprs[rm];
				break;

			// CMP(3)
			case 0x0100:
				gprs[cpu.PC] += this.instructionWidth;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				var aluOut = gprs[rd] - gprs[rm];
				cpu.cpsrN = aluOut >> 31;
				cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rd] >>> 0) >= (gprs[rm] >>> 0);
				cpu.cpsrV = ((gprs[rd] ^ gprs[rm]) >> 31) && ((gprs[rd] ^ aluOut) >> 31);
				writesPC = false;
				break;

			// MOV(3)
			case 0x0200:
				writesPC = rd === cpu.PC;
				gprs[cpu.PC] += this.instructionWidth;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = gprs[rm];
				break;

			// BX
			case 0x0300:
				gprs[cpu.PC] += this.instructionWidth;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				cpu.switchExecMode(gprs[rm] & 0x00000001);
				var misalign = 0;
				if (rm === 15) {
					misalign = gprs[rm] & 0x00000002;
				}
				gprs[cpu.PC] = gprs[rm] & 0xFFFFFFFE - misalign;
				writesPC = true;
				break;

		}

	}
	else if ((instruction & 0xF800) === 0x1800) {

		// Add/subtract

		var rm = (instruction & 0x01C0) >> 6;
		var rn = (instruction & 0x0038) >> 3;
		var rd = instruction & 0x0007;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		// Switch on the opcode
		switch (instruction & 0x0600) {
			
			case 0x0000:
				// ADD(3)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				var d = (gprs[rn] >>> 0) + (gprs[rm] >>> 0);
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = d > 0xFFFFFFFF;
				cpu.cpsrV = !((gprs[rn] ^ gprs[rm]) >> 31) && ((gprs[rn] ^ d) >> 31) && ((gprs[rm] ^ d) >> 31);
				gprs[rd] = d;
				break;
			
			case 0x0200:
				// SUB(3)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				var d = gprs[rn] - gprs[rm];
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rn] >>> 0) >= (gprs[rm] >>> 0);
				cpu.cpsrV = (gprs[rn] >> 31) != (gprs[rm] >> 31) &&
							(gprs[rn] >> 31) != (d >> 31);
				gprs[rd] = d;
				break;
			
			case 0x0400:
				var immediate = (instruction & 0x01C0) >> 6;
				if (immediate) {
					// ADD(1)
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					var d = (gprs[rn] >>> 0) + immediate;
					cpu.cpsrN = d >> 31;
					cpu.cpsrZ = !(d & 0xFFFFFFFF);
					cpu.cpsrC = d > 0xFFFFFFFF;
					cpu.cpsrV = !(gprs[rn] >> 31) && ((gprs[rn] >> 31 ^ d) >> 31) && (d >> 31);
					gprs[rd] = d;
				}
				else {
					// MOV(2)
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					var d = gprs[rn];
					cpu.cpsrN = d >> 31;
					cpu.cpsrZ = !(d & 0xFFFFFFFF);
					cpu.cpsrC = 0;
					cpu.cpsrV = 0;
					gprs[rd] = d;
				}
				break;
			
			case 0x0600:
				// SUB(1)
				var immediate = (instruction & 0x01C0) >> 6;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				var d = gprs[rn] - immediate;
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
				cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31);
				gprs[rd] = d;
				break;
		
		}
		
		writesPC = false;

	}
	else if (!(instruction & 0xE000)) {
		
		// Shift by immediate
		
		var rd = instruction & 0x0007;
		var rm = (instruction & 0x0038) >> 3;
		var immediate = (instruction & 0x07C0) >> 6;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		// Switch on the opcode
		switch (instruction & 0x1800) {

			// LSL(1)
			case 0x0000:
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				if (immediate === 0) {
					gprs[rd] = gprs[rm];
				} else {
					cpu.cpsrC = gprs[rm] & (1 << (32 - immediate));
					gprs[rd] = gprs[rm] << immediate;
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// LSR(1)
			case 0x0800:
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				if (immediate === 0) {
					cpu.cpsrC = gprs[rm] >> 31;
					gprs[rd] = 0;
				}
				else {
					cpu.cpsrC = gprs[rm] & (1 << (immediate - 1));
					gprs[rd] = gprs[rm] >>> immediate;
				}
				cpu.cpsrN = 0;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			// ASR(1)
			case 0x1000:
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				if (immediate === 0) {
					cpu.cpsrC = gprs[rm] >> 31;
					if (cpu.cpsrC) {
						gprs[rd] = 0xFFFFFFFF;
					}
					else {
						gprs[rd] = 0;
					}
				}
				else {
					cpu.cpsrC = gprs[rm] & (1 << (immediate - 1));
					gprs[rd] = gprs[rm] >> immediate;
				}
				cpu.cpsrN = gprs[rd] >> 31;
				cpu.cpsrZ = !(gprs[rd] & 0xFFFFFFFF);
				break;

			case 0x1800:
				//???
				break;

		}

		writesPC = false;

	}
	else if ((instruction & 0xE000) === 0x2000) {

		// Add/subtract/compare/move immediate

		var immediate = instruction & 0x00FF;
		var rn = (instruction & 0x0700) >> 8;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		
		// Switch on the opcode
		switch (instruction & 0x1800) {
			
			// MOV(1)
			case 0x0000:
				gprs[rn] = immediate;
				cpu.cpsrN = immediate >> 31;
				cpu.cpsrZ = !(immediate & 0xFFFFFFFF);
				break;

			// CMP(1)
			case 0x0800:
				var aluOut = gprs[rn] - immediate;
				cpu.cpsrN = aluOut >> 31;
				cpu.cpsrZ = !(aluOut & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
				cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ aluOut) >> 31);
				break;

			// ADD(2)
			case 0x1000:
				var d = (gprs[rn] >>> 0) + immediate;
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = d > 0xFFFFFFFF;
				cpu.cpsrV = !(gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31) && ((immediate ^ d) >> 31);
				gprs[rn] = d;
				break;

			// SUB(2)
			case 0x1800:
				var d = gprs[rn] - immediate;
				cpu.cpsrN = d >> 31;
				cpu.cpsrZ = !(d & 0xFFFFFFFF);
				cpu.cpsrC = (gprs[rn] >>> 0) >= immediate;
				cpu.cpsrV = (gprs[rn] >> 31) && ((gprs[rn] ^ d) >> 31);
				gprs[rn] = d;
				break;

		}

		writesPC = false;

	}
	else if ((instruction & 0xF800) === 0x4800) {

		// LDR(3)

		var rd = (instruction & 0x0700) >> 8;
		var immediate = (instruction & 0x00FF) << 2;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		cpu.mmu.waitPrefetch(gprs[cpu.PC]);
		gprs[rd] = cpu.mmu.load32((gprs[cpu.PC] & 0xFFFFFFFC) + immediate);
		cpu.mmu.wait32(gprs[cpu.PC]);
		++cpu.cycles;
		
		writesPC = false;

	}
	else if ((instruction & 0xF000) === 0x5000) {
		
		// Load and store with relative offset
		
		var rd = instruction & 0x0007;
		var rn = (instruction & 0x0038) >> 3;
		var rm = (instruction & 0x01C0) >> 6;
		
		interpret = true;
		gprs[this.PC] += this.instructionWidth;

		var opcode = instruction & 0x0E00;
		
		switch (opcode) {
			

			case 0x0000:
				// STR(2)
				cpu.mmu.store32(gprs[rn] + gprs[rm], gprs[rd]);
				cpu.mmu.wait(gprs[cpu.PC]);
				cpu.mmu.wait32(gprs[rn] + gprs[rm]);
				break;
			

			case 0x0200:
				// STRH(2)
				cpu.mmu.store16(gprs[rn] + gprs[rm], gprs[rd]);
				cpu.mmu.wait(gprs[cpu.PC]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				break;
			

			case 0x0400:
				// STRB(2)
				cpu.mmu.store8(gprs[rn] + gprs[rm], gprs[rd]);
				cpu.mmu.wait(gprs[cpu.PC]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				break;
			

			case 0x0600:
				// LDRSB
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.load8(gprs[rn] + gprs[rm]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				++cpu.cycles;
				break;
			

			case 0x0800:
				// LDR(2)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.load32(gprs[rn] + gprs[rm]);
				cpu.mmu.wait32(gprs[rn] + gprs[rm]);
				++cpu.cycles;
				break;
			

			case 0x0A00:
				// LDRH(2)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.loadU16(gprs[rn] + gprs[rm]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				++cpu.cycles;
				break;
			

			case 0x0C00:
				// LDRB(2)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.loadU8(gprs[rn] + gprs[rm]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				++cpu.cycles;
				break;
			

			case 0x0E00:
				// LDRSH
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.load16(gprs[rn] + gprs[rm]);
				cpu.mmu.wait(gprs[rn] + gprs[rm]);
				++cpu.cycles;
				break;
		}
		
		writesPC = false;
	
	}
	else if ((instruction & 0xE000) === 0x6000) {
		
		// Load and store with immediate offset
		
		var rd = instruction & 0x0007;
		var rn = (instruction & 0x0038) >> 3;
		var immediate = (instruction & 0x07C0) >> 4;
		
		var b = instruction & 0x1000;
		if (b) {
			immediate >>= 2;
		}
		
		interpret = true;
		gprs[this.PC] += this.instructionWidth;
		
		var load = instruction & 0x0800;
		if (load) {
			if (b) {
				// LDRB(1)
				var n = gprs[rn] + immediate;
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				gprs[rd] = cpu.mmu.loadU8(n);
				cpu.mmu.wait(n);
				++cpu.cycles;
			}
			else {
				// LDR(1)
				cpu.mmu.waitPrefetch(gprs[cpu.PC]);
				var n = gprs[rn] + immediate;
				gprs[rd] = cpu.mmu.load32(n);
				cpu.mmu.wait32(n);
				++cpu.cycles;
			}
		}
		else {
			if (b) {
				// STRB(1)
				var n = gprs[rn] + immediate;
				cpu.mmu.store8(n, gprs[rd]);
				cpu.mmu.wait(gprs[cpu.PC]);
				cpu.mmu.wait(n);
			}
			else {
				// STR(1)
				var n = gprs[rn] + immediate;
				cpu.mmu.store32(n, gprs[rd]);
				cpu.mmu.wait(gprs[cpu.PC]);
				cpu.mmu.wait32(n);
			}
		}

		writesPC = false;

	}
	else if ((instruction & 0xF600) === 0xB400) {
		
		// Push and pop registers
		
		var r = !!(instruction & 0x0100);
		var rs = instruction & 0x00FF;

		interpret = true;
		gprs[this.PC] += this.instructionWidth;
		
		if (instruction & 0x0800) {
			
			// POP
			
			cpu.mmu.waitPrefetch(gprs[cpu.PC]);
			++cpu.cycles;
			var address = gprs[cpu.SP];
			var total = 0;
			var m, i;
			for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
				if (rs & m) {
					cpu.mmu.waitSeq32(address);
					gprs[i] = cpu.mmu.load32(address);
					address += 4;
					++total;
				}
			}
			if (r) {
				gprs[cpu.PC] = cpu.mmu.load32(address) & 0xFFFFFFFE;
				address += 4;
				++total;
			}
			cpu.mmu.waitMulti32(address, total);
			gprs[cpu.SP] = address;
			
			writesPC = r;

		}
		else {
			
			// PUSH
			
			var address = gprs[cpu.SP] - 4;
			var total = 0;
			cpu.mmu.waitPrefetch(gprs[cpu.PC]);
			if (r) {
				cpu.mmu.store32(address, gprs[cpu.LR]);
				address -= 4;
				++total;
			}
			var m, i;
			for (m = 0x80, i = 7; m; m >>= 1, --i) {
				if (rs & m) {
					cpu.mmu.store32(address, gprs[i]);
					address -= 4;
					++total;
					break;
				}
			}
			for (m >>= 1, --i; m; m >>= 1, --i) {
				if (rs & m) {
					cpu.mmu.store32(address, gprs[i]);
					address -= 4;
					++total;
				}
			}
			cpu.mmu.waitMulti32(address, total);
			gprs[cpu.SP] = address + 4;
			
			writesPC = false;
		
		}
	}
	else if (instruction & 0x8000) {
		
		switch (instruction & 0x7000) {
			
			case 0x0000:
				
				// Load and store halfword

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				var rd = instruction & 0x0007;
				var rn = (instruction & 0x0038) >> 3;
				var immediate = (instruction & 0x07C0) >> 5;
				
				if (instruction & 0x0800) {
					// LDRH(1)
					var n = gprs[rn] + immediate;
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					gprs[rd] = cpu.mmu.loadU16(n);
					cpu.mmu.wait(n);
					++cpu.cycles;
				}
				else {
					// STRH(1)
					var n = gprs[rn] + immediate;
					cpu.mmu.store16(n, gprs[rd]);
					cpu.mmu.wait(gprs[cpu.PC]);
					cpu.mmu.wait(n);
				}
				
				writesPC = false;
				
				break;
			
			case 0x1000:
				
				// SP-relative load and store

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				var rd = (instruction & 0x0700) >> 8;
				var immediate = (instruction & 0x00FF) << 2;
				var load = instruction & 0x0800;
				
				if (load) {
					// LDR(4)
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					gprs[rd] = cpu.mmu.load32(gprs[cpu.SP] + immediate);
					cpu.mmu.wait32(gprs[cpu.SP] + immediate);
					++cpu.cycles;
				}
				else {
					// STR(3)
					cpu.mmu.store32(gprs[cpu.SP] + immediate, gprs[rd]);
					cpu.mmu.wait(gprs[cpu.PC]);
					cpu.mmu.wait32(gprs[cpu.SP] + immediate);
				}
				
				writesPC = false;
				
				break;
			
			case 0x2000:
				
				// Load address

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				var rd = (instruction & 0x0700) >> 8;
				var immediate = (instruction & 0x00FF) << 2;
				if (instruction & 0x0800) {
					// ADD(6)
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					gprs[rd] = gprs[cpu.SP] + immediate;
				}
				else {
					// ADD(5)
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					gprs[rd] = (gprs[cpu.PC] & 0xFFFFFFFC) + immediate;
				}
				
				writesPC = false;
				
				break;
			
			case 0x3000:
				
				// Miscellaneous

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				if (!(instruction & 0x0F00)) {
					
					// Adjust stack pointer
					// ADD(7)/SUB(4)
					
					// var b = instruction & 0x0080;
					var immediate = (instruction & 0x7F) << 2;
					
					// Check if to negate the immediate, meaning its SUB(4)
					if (instruction & 0x0080) {
						immediate = -immediate;
					}

					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					gprs[cpu.SP] += immediate;
					
					writesPC = false;
				
				}
				break;
			
			case 0x4000:
				
				// Multiple load and store

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				var rn = (instruction & 0x0700) >> 8;
				var rs = instruction & 0x00FF;
				
				if (instruction & 0x0800) {
					// LDMIA
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					var address = gprs[rn];
					var total = 0;
					var m, i;
					for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
						if (rs & m) {
							gprs[i] = cpu.mmu.load32(address);
							address += 4;
							++total;
						}
					}
					cpu.mmu.waitMulti32(address, total);
					if (!((1 << rn) & rs)) {
						gprs[rn] = address;
					}
				}
				else {
					// STMIA
					cpu.mmu.wait(gprs[cpu.PC]);
					var address = gprs[rn];
					var total = 0;
					var m, i;
					for (m = 0x01, i = 0; i < 8; m <<= 1, ++i) {
						if (rs & m) {
							cpu.mmu.store32(address, gprs[i]);
							address += 4;
							++total;
							break;
						}
					}
					for (m <<= 1, ++i; i < 8; m <<= 1, ++i) {
						if (rs & m) {
							cpu.mmu.store32(address, gprs[i]);
							address += 4;
							++total;
						}
					}
					cpu.mmu.waitMulti32(address, total);
					gprs[rn] = address;
				}
				
				writesPC = false;
				
				break;
			
			case 0x5000:
				
				// Conditional branch

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				var cond = (instruction & 0x0F00) >> 8;
				var immediate = (instruction & 0x00FF);
				
				if (cond === 0xF) {
					// SWI
					cpu.irq.swi(immediate);
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					writesPC = false;
				}
				else {
					// B(1)
					if (instruction & 0x0080) {
						immediate |= 0xFFFFFF00;
					}
					immediate <<= 1;
					var condOp = this.conds[cond];
					cpu.mmu.waitPrefetch(gprs[cpu.PC]);
					if (condOp()) {
						gprs[cpu.PC] += immediate;
					}
					writesPC = true;
				}
				break;
			
			case 0x6000:
			
			case 0x7000:
				// BL(X)
				
				var immediate = instruction & 0x07FF;
				var h = instruction & 0x1800;

				interpret = true;
				gprs[this.PC] += this.instructionWidth;
				
				switch (h) {
				
					case 0x0000:
						// B(2)
						if (immediate & 0x0400) {
							immediate |= 0xFFFFF800;
						}
						immediate <<= 1;
						cpu.mmu.waitPrefetch(gprs[cpu.PC]);
						gprs[cpu.PC] += immediate;
						writesPC = true;
						break;
					
					case 0x0800:
						// BLX (ARMv5T)
						/*op = function() {
							var pc = gprs[cpu.PC];
							gprs[cpu.PC] = (gprs[cpu.LR] + (immediate << 1)) & 0xFFFFFFFC;
							gprs[cpu.LR] = pc - 1;
							cpu.switchExecMode(cpu.MODE_ARM);
						}*/
						break;
					
					case 0x1000:
						// BL(1)
						if (immediate & 0x0400) {
							immediate |= 0xFFFFFC00;
						}
						immediate <<= 12;
						cpu.mmu.waitPrefetch(gprs[cpu.PC]);
						gprs[cpu.LR] = gprs[cpu.PC] + immediate;
						writesPC = false;
						break;
					
					case 0x1800:
						// BL(2)
						cpu.mmu.waitPrefetch(gprs[cpu.PC]);
						var pc = gprs[cpu.PC];
						gprs[cpu.PC] = gprs[cpu.LR] + (immediate << 1);
						gprs[cpu.LR] = pc - 1;
						writesPC = true;
						break;
				
				}

				break;

			default:
				this.WARN("Undefined instruction: 0x" + instruction.toString(16));
		
		}
	}
	else {
		throw 'Bad opcode: 0x' + instruction.toString(16);
	}

	if(interpret){
		// The instruction has already been interpreted, so just increment the count and return
		this.interpretedCount++;
	}
	else{
		gprs[this.PC] += this.instructionWidth;
		op();
		this.compiledCount++;
	}

	return writesPC;
};
