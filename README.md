# COA-Project
# Booth's Algorithm Step by Step Visualizer

An interactive, cycle-accurate computer architecture simulator designed to model, profile, and visualize signed two's complement multiplication using **Booth's Multiplication Algorithm**. Developed as part of the Computer Organization and Architecture (COA) curriculum at **Woxsen University, School of Technology**.

---

## Overview

Traditional shift-and-add multipliers require positive magnitudes, incurring additional clock cycles for operand sign extraction and post-multiplication negation. Booth's algorithm processes signed two's complement numbers natively by decoding adjacent bit pairs ($Q_n, Q_{n+1}$). By replacing consecutive strings of binary ones with a single subtraction and addition, the algorithm reduces full-adder transitions, lowering dynamic power dissipation:

$$P_{\text{dynamic}} = \alpha \cdot C \cdot V^2 \cdot f$$

This platform couples an educational register state inspector with practical vector coprocessor workloads.

---

## Architectural Features & Operational Modes

### Mode 1: Quad-Core Complex MAC Coprocessor
- Evaluates $(a + jb)(c + jd) = (ac - bd) + j(ad + bc)$ across four concurrent Booth MAC channels.
- Subtracts $bd$ natively within two's complement arithmetic, eliminating dedicated sign-inverter stages in the real channel.
- Achieves up to ~45% latency reduction compared to standard shift-and-add hardware.

### Mode 2: 3D Affine Vertex Transformation Coprocessor
- Real-time 3D coordinate transformation pipeline rendering an 8-vertex cube on HTML5 Canvas at 60 FPS.
- Quantizes continuous trigonometric rotation parameters into signed 5-bit fixed-point integers (1:14 scaling factor).
- Evaluates 72 signed dot products per frame, reducing ALU switching activity by ~30.6% compared to conventional multiplication.

### Mode 3: IEEE 754 Floating-Point Unit (FPU) Pipeline
- Decouples floating-point multiplication into four independent pipeline stages:
  1. **Sign Logic:** Evaluates output sign via $S_{\text{result}} = S_A \oplus S_B$.
  2. **Exponent Adder:** Adds biased exponents: $E_{\text{result}} = E_A + E_B - 127$.
  3. **Mantissa Multiplier:** Processes $24 \times 24$ bit significand products using the Booth core.
  4. **Normalization & Packing:** Adjusts overflow shifts and packs bits into standard 32-bit format.

### Mode 4: Single-Core Step-by-Step Register Inspector
- Interactive cycle-by-cycle educational datapath tracing.
- Real-time tracking of Accumulator ($AC$), Multiplier ($QR$), Multiplicand ($BR$), Sequence Counter ($SC$), and Prior Bit ($Q_{n+1}$) registers.
- Dynamic decimal verification and bit-pair transition explanations.

---

## Hardware Benchmarks Summary

| Workload Metric | Traditional Shift-and-Add | Booth Coprocessor | Hardware Efficiency |
| :--- | :---: | :---: | :---: |
| **Complex Vector Latency** | 22 clock cycles | 12 clock cycles | **~45.4% faster** |
| **3D Mesh Operations / Frame** | 75 operations | 52 operations | **~30.6% switching reduction** |
| **Dedicated Sign Inversion Cycles** | 18 cycles / frame | 0 cycles | **100% eliminated** |

---

## Technology Stack

- **HTML5:** Semantic UI structure, register input forms, and status dashboards.
- **CSS3:** Custom responsive layout and dark/light coprocessor theme styling.
- **JavaScript (ES6):** Bitwise arithmetic engines, ripple-carry addition, two's complement inversion, and cycle-accurate hardware state tracking.
- **HTML5 Canvas API:** Hardware-accelerated 3D wireframe mesh rendering.

---

## Project Structure

```text
├── index.html        # Main simulation dashboard & coprocessor interface
├── script.js         # Core Booth ALU state machine & coprocessor engines
├── style.css         # UI layout, typography, and visual themes
└── README.md         # Technical documentation & project profile
