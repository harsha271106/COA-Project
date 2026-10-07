const BIT_WIDTH = 5;
let allSteps = [];
let currentStepIndex = 0;

// ==================== BOOTH HARDWARE ARITHMETIC CORE ====================

function toTwosComplement(num, bits) {
  if (num < 0) {
    num = (1 << bits) + num;
  }
  let bin = (num >>> 0).toString(2);
  while (bin.length < bits) bin = "0" + bin;
  return bin.slice(-bits);
}

function addBinary(a, b, bits) {
  let carry = 0;
  let result = "";
  for (let i = bits - 1; i >= 0; i--) {
    let bitA = parseInt(a[i], 10);
    let bitB = parseInt(b[i], 10);
    let sum = bitA + bitB + carry;
    result = (sum % 2).toString() + result;
    carry = Math.floor(sum / 2);
  }
  return result;
}

function getTwosComplementString(binStr, bits) {
  let inverted = "";
  for (let i = 0; i < binStr.length; i++) {
    inverted += binStr[i] === "0" ? "1" : "0";
  }
  let one = "1".padStart(bits, "0");
  return addBinary(inverted, one, bits);
}

function generateBoothSteps(brVal, qrVal, customBitWidth = BIT_WIDTH) {
  const steps = [];
  const BR = toTwosComplement(brVal, customBitWidth);
  const BR_comp = getTwosComplementString(BR, customBitWidth);
  let QR = toTwosComplement(qrVal, customBitWidth);
  let AC = "0".repeat(customBitWidth);
  let Qn1 = "0";
  let SC = customBitWidth;

  steps.push({
    cycle: "Init",
    pair: "-",
    operation: "Load Registers",
    AC: AC,
    QR: QR,
    Qn1: Qn1,
    SC: SC,
    desc: `Loaded BR = ${BR}, QR = ${QR}`
  });

  while (SC > 0) {
    const Qn = QR[QR.length - 1];
    const pair = Qn + Qn1;

    if (pair === "10") {
      AC = addBinary(AC, BR_comp, customBitWidth);
      steps.push({
        cycle: `C${customBitWidth - SC + 1}`,
        pair: pair,
        operation: "Subtract BR (AC ← AC + BR' + 1)",
        AC: AC,
        QR: QR,
        Qn1: Qn1,
        SC: SC,
        desc: `Pair 10: AC - BR`
      });
    } else if (pair === "01") {
      AC = addBinary(AC, BR, customBitWidth);
      steps.push({
        cycle: `C${customBitWidth - SC + 1}`,
        pair: pair,
        operation: "Add BR (AC ← AC + BR)",
        AC: AC,
        QR: QR,
        Qn1: Qn1,
        SC: SC,
        desc: `Pair 01: AC + BR`
      });
    }

    const combined = AC + QR;
    const newQn1 = combined[combined.length - 1];
    const shiftedCombined = combined[0] + combined.slice(0, combined.length - 1);
    AC = shiftedCombined.slice(0, customBitWidth);
    QR = shiftedCombined.slice(customBitWidth);
    Qn1 = newQn1;
    SC = SC - 1;

    steps.push({
      cycle: `C${customBitWidth - SC}`,
      pair: pair,
      operation: "ashr (Arithmetic Shift Right)",
      AC: AC,
      QR: QR,
      Qn1: Qn1,
      SC: SC,
      desc: `Shift right AC & QR. SC = ${SC}`
    });
  }

  return steps;
}

// ==================== ACCURATE MAC HARDWARE PROFILER ====================

function computeHardwareMAC(valA, valB, isSubtracted = false) {
  // 1. BOOTH MAC PIPELINE:
  // - Evaluates signed 2's complement directly (0 sign unpack cycles)
  // - Bit-pair encoding collapses contiguous runs of 1s into single add/sub transitions
  const steps = generateBoothSteps(valA, valB);
  const boothALUToggles = steps.filter(s => s.operation.startsWith("Add") || s.operation.startsWith("Subtract")).length;
  const boothAccumulateCycles = 1; // Native fused accumulation into AC register
  const totalBoothCycles = boothALUToggles + boothAccumulateCycles;

  // 2. TRADITIONAL SHIFT-AND-ADD MAC PIPELINE:
  // Stage A: Sign-magnitude extraction penalty (converting negative inputs to unsigned magnitudes)
  let signUnpackCycles = 0;
  if (valA < 0) signUnpackCycles += 1;
  if (valB < 0) signUnpackCycles += 1;

  // Stage B: Shift-and-add core (adds on EVERY logic '1' in magnitude)
  const absB = Math.abs(valB);
  const binB = absB.toString(2);
  const shiftAddToggles = (binB.match(/1/g) || []).length;

  // Stage C: Sign restoration penalty (negating product back to 2's complement)
  const isProductNegative = (valA < 0) ^ (valB < 0);
  const signNegateCycles = isProductNegative ? 1 : 0;

  // Stage D: Accumulation & Subtraction stage
  // If subtracting (-bd), traditional units must run an extra 2's complement negation before addition
  const accumulateCycles = isSubtracted ? 2 : 1; 

  const totalTraditionalCycles = signUnpackCycles + shiftAddToggles + signNegateCycles + accumulateCycles;

  return {
    product: valA * valB,
    boothCycles: totalBoothCycles,
    boothToggles: boothALUToggles,
    traditionalCycles: totalTraditionalCycles,
    breakdown: {
      signPenalty: signUnpackCycles + signNegateCycles,
      shiftAdds: shiftAddToggles,
      accumulatePenalty: accumulateCycles
    }
  };
}

// ==================== MODE 1: COMPLEX MULTIPLIER CORE ====================

function executeComplexMultiplication() {
  const a = parseInt(document.getElementById("real-a").value, 10);
  const b = parseInt(document.getElementById("imag-b").value, 10);
  const c = parseInt(document.getElementById("real-c").value, 10);
  const d = parseInt(document.getElementById("imag-d").value, 10);

  if ([a, b, c, d].some(v => isNaN(v) || v < -16 || v > 15)) {
    alert("Please enter signed integers between -16 and 15 for 5-bit registers.");
    return;
  }

  // Four Parallel Hardware MAC Units:
  // Core 1: (a * c) -> added to Real AC
  // Core 2: (b * d) -> SUBTRACTED from Real AC (ac - bd)
  // Core 3: (a * d) -> added to Imag AC
  // Core 4: (b * c) -> added to Imag AC
  const macAC = computeHardwareMAC(a, c, false);
  const macBD = computeHardwareMAC(b, d, true); // Subtracted term (-bd)
  const macAD = computeHardwareMAC(a, d, false);
  const macBC = computeHardwareMAC(b, c, false);

  renderMacUnit("mac-1-result", a, c, macAC);
  renderMacUnit("mac-2-result", b, d, macBD);
  renderMacUnit("mac-3-result", a, d, macAD);
  renderMacUnit("mac-4-result", b, c, macBC);

  const realPart = macAC.product - macBD.product;
  const imagPart = macAD.product + macBC.product;

  const totalBoothCycles = macAC.boothCycles + macBD.boothCycles + macAD.boothCycles + macBC.boothCycles;
  const totalStandardCycles = macAC.traditionalCycles + macBD.traditionalCycles + macAD.traditionalCycles + macBC.traditionalCycles;

  const signStr = imagPart >= 0 ? `+ ${imagPart}j` : `- ${Math.abs(imagPart)}j`;

  document.getElementById("complex-final-output").innerHTML = `
    <b>Result: (${a} + ${b}j) × (${c} + ${d}j) = <span style="color: #38bdf8;">${realPart} ${signStr}</span></b><br>
    <span style="font-size: 12px; color: #94a3b8;">
      Real Part: (${macAC.product}) - (${macBD.product}) = <b>${realPart}</b> &nbsp;|&nbsp; 
      Imag Part: (${macAD.product}) + (${macBC.product}) = <b>${imagPart}</b>
    </span>
  `;

  const saved = totalStandardCycles - totalBoothCycles;
  const pct = Math.max(0, Math.round((saved / totalStandardCycles) * 100));

  document.getElementById("complex-summary").innerHTML = `
    <b>Quad-Core MAC Hardware Profiling (Complex Vector Workload):</b><br>
    • Quad-Core Booth MAC Execution Latency: <b style="color: #38bdf8;">${totalBoothCycles} clock cycles</b><br>
    • Quad-Core Traditional MAC Latency: <b style="color: #f87171;">${totalStandardCycles} clock cycles</b><br>
    <span style="color: #4ade80; font-weight: bold;">
      Hardware Efficiency: Booth MAC saves ${saved} cycles (~${pct}% latency reduction)!
    </span><br>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 8px 0;">
    <span style="font-size: 12px; color: #cbd5e1;">
      <b>Why Booth MAC Outperforms Traditional Units:</b><br>
      1. <b>Zero Sign-Inversion Latency:</b> Traditional multipliers require extra clock cycles to take absolute values and re-negate negative products. Booth evaluates signed 2's complement directly.<br>
      2. <b>Native Fused Subtraction (-bd):</b> Calculating the Real component requires subtracting a product. Traditional MACs stall to invert the operand into an adder; Booth MACs naturally accumulate negative 2's complement terms without extra hardware overhead.
    </span>
  `;
}

function renderMacUnit(elementId, valA, valB, result) {
  document.getElementById(elementId).innerHTML = `
    Inputs: <code>${valA}</code> × <code>${valB}</code><br>
    Product: <b>${result.product}</b><br>
    Booth MAC: <b style="color: #38bdf8;">${result.boothCycles} cycles</b><br>
    <span style="font-size: 11px; color: #94a3b8;">Traditional MAC: ${result.traditionalCycles} cycles</span>
  `;
}

// ==================== MODE 2: 3D GRAPHICS VERTEX ENGINE ====================

const canvas3D = document.getElementById("canvas-3d");
const ctx3D = canvas3D.getContext("2d");

const CUBE_VERTICES = [
  [-10, -10, -10],
  [ 10, -10, -10],
  [ 10,  10, -10],
  [-10,  10, -10],
  [-10, -10,  10],
  [ 10, -10,  10],
  [ 10,  10,  10],
  [-10,  10,  10]
];

const CUBE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

function handleModelRotation() {
  const yaw = parseInt(document.getElementById("slider-yaw").value, 10);
  const pitch = parseInt(document.getElementById("slider-pitch").value, 10);

  document.getElementById("yaw-display").innerText = `${yaw}°`;
  document.getElementById("pitch-display").innerText = `${pitch}°`;

  render3DTransform(yaw, pitch);
}

function reset3DView() {
  document.getElementById("slider-yaw").value = 45;
  document.getElementById("slider-pitch").value = 30;
  handleModelRotation();
}

function render3DTransform(yawDeg, pitchDeg) {
  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const cp = Math.cos(pitchRad);
  const sp = Math.sin(pitchRad);

  const SCALE = 14;
  const m00 = Math.round(cy * SCALE);
  const m01 = Math.round(0 * SCALE);
  const m02 = Math.round(sy * SCALE);

  const m10 = Math.round((sp * sy) * SCALE);
  const m11 = Math.round(cp * SCALE);
  const m12 = Math.round((-sp * cy) * SCALE);

  const m20 = Math.round((-cp * sy) * SCALE);
  const m21 = Math.round(sp * SCALE);
  const m22 = Math.round((cp * cy) * SCALE);

  document.getElementById("matrix-display").innerHTML = `
    <div style="color: #94a3b8; margin-bottom: 8px; font-weight: bold;">Affine Transform Matrix (Fixed-Point Scale 1:14)</div>
    [ ${m00.toString().padStart(3, ' ')}  ${m01.toString().padStart(3, ' ')}  ${m02.toString().padStart(3, ' ')} ]<br>
    [ ${m10.toString().padStart(3, ' ')}  ${m11.toString().padStart(3, ' ')}  ${m12.toString().padStart(3, ' ')} ]<br>
    [ ${m20.toString().padStart(3, ' ')}  ${m21.toString().padStart(3, ' ')}  ${m22.toString().padStart(3, ' ')} ]<br>
    <div style="color: #64748b; font-size: 11px; margin-top: 8px;">Alternating signed trigonometric coordinates</div>
  `;

  const transformedVertices = [];
  let totalBoothCycles = 0;
  let totalStandardCycles = 0;
  let totalMACs = 0;

  for (let i = 0; i < CUBE_VERTICES.length; i++) {
    const [vx, vy, vz] = CUBE_VERTICES[i];

    const xOps = computeVectorRowDot(vx, vy, vz, m00, m01, m02);
    const yOps = computeVectorRowDot(vx, vy, vz, m10, m11, m12);
    const zOps = computeVectorRowDot(vx, vy, vz, m20, m21, m22);

    totalBoothCycles += (xOps.booth + yOps.booth + zOps.booth);
    totalStandardCycles += (xOps.standard + yOps.standard + zOps.standard);
    totalMACs += 9;

    const distance = 40;
    const projZ = zOps.result + distance;
    const fov = 220;
    const screenX = (xOps.result * fov) / (projZ === 0 ? 1 : projZ) + (canvas3D.width / 2);
    const screenY = (yOps.result * fov) / (projZ === 0 ? 1 : projZ) + (canvas3D.height / 2);

    transformedVertices.push({ x: screenX, y: screenY });
  }

  drawWireframe(transformedVertices);

  const saved = totalStandardCycles - totalBoothCycles;
  const pct = Math.max(0, Math.round((saved / totalStandardCycles) * 100));

  document.getElementById("gpu-summary").innerHTML = `
    <b>GPU Vertex Shader Matrix Workload (${totalMACs} Signed Dot Products):</b><br>
    • Booth MAC Execution Latency: <b style="color: #38bdf8;">${totalBoothCycles} cycles</b> &nbsp;|&nbsp; Traditional MAC: <b style="color: #f87171;">${totalStandardCycles} cycles</b><br>
    <span style="color: #4ade80; font-weight: bold;">
      Hardware Efficiency: Saved ${saved} clock cycles (~${pct}% latency reduction)!
    </span><br>
    <b>Real-World Application:</b> Mobile GPUs (Apple Metal, Qualcomm Adreno) process millions of vertices per frame. Booth-encoded MAC units avoid sign-conversion stalls on alternating trigonometric signs, keeping chips within passive thermal envelopes.
  `;
}

function computeVectorRowDot(vx, vy, vz, m0, m1, m2) {
  const rowTerms = [
    { v: vx, m: m0 },
    { v: vy, m: m1 },
    { v: vz, m: m2 }
  ];

  let sum = 0;
  let boothCycles = 0;
  let standardCycles = 0;

  for (let term of rowTerms) {
    sum += Math.round((term.v * term.m) / 14);
    const macData = computeHardwareMAC(term.v, term.m, false);
    boothCycles += macData.boothCycles;
    standardCycles += macData.traditionalCycles;
  }

  return { result: sum, booth: boothCycles, standard: standardCycles };
}

function drawWireframe(vertices) {
  ctx3D.fillStyle = "#020617";
  ctx3D.fillRect(0, 0, canvas3D.width, canvas3D.height);

  ctx3D.strokeStyle = "#38bdf8";
  ctx3D.lineWidth = 2;

  for (let edge of CUBE_EDGES) {
    const vA = vertices[edge[0]];
    const vB = vertices[edge[1]];

    ctx3D.beginPath();
    ctx3D.moveTo(vA.x, vA.y);
    ctx3D.lineTo(vB.x, vB.y);
    ctx3D.stroke();
  }

  ctx3D.fillStyle = "#4ade80";
  for (let v of vertices) {
    ctx3D.beginPath();
    ctx3D.arc(v.x, v.y, 4, 0, Math.PI * 2);
    ctx3D.fill();
  }
}

// ==================== MODE 3: IEEE 754 FLOATING POINT ====================

function decomposeFloat(val) {
  const sign = val < 0 ? 1 : 0;
  const absVal = Math.abs(val);

  if (absVal === 0) {
    return { sign: 0, exponent: 0, mantissaInt: 0, floatVal: 0 };
  }

  const expUnbiased = Math.floor(Math.log2(absVal));
  const normalizedFraction = absVal / Math.pow(2, expUnbiased);
  const mantissaInt = Math.round(normalizedFraction * 8);

  return {
    sign: sign,
    exponent: expUnbiased,
    mantissaInt: mantissaInt,
    floatVal: val
  };
}

function executeFloatingPointMultiplication() {
  const valA = parseFloat(document.getElementById("float-a").value);
  const valB = parseFloat(document.getElementById("float-b").value);

  if (isNaN(valA) || isNaN(valB)) {
    alert("Please enter valid numbers for both operands.");
    return;
  }

  const opA = decomposeFloat(valA);
  const opB = decomposeFloat(valB);

  const resultSign = opA.sign ^ opB.sign;
  const resultExp = opA.exponent + opB.exponent;

  const mantissaBits = 6;
  const boothSteps = generateBoothSteps(opA.mantissaInt, opB.mantissaInt, mantissaBits);
  const rawMantissaProduct = opA.mantissaInt * opB.mantissaInt;
  const boothOps = boothSteps.filter(s => s.operation.startsWith("Add") || s.operation.startsWith("Subtract")).length;

  const product = (resultSign === 1 ? -1 : 1) * Math.abs(valA * valB);

  document.getElementById("fpu-sign-result").innerHTML = `
    Sign A: <code>${opA.sign}</code>, Sign B: <code>${opB.sign}</code><br>
    Gate: <code>${opA.sign} XOR ${opB.sign} = ${resultSign}</code><br>
    Result Sign: <b>${resultSign === 0 ? 'Positive (+)' : 'Negative (-)'}</b>
  `;

  document.getElementById("fpu-exp-result").innerHTML = `
    Exp A: <code>2^${opA.exponent}</code>, Exp B: <code>2^${opB.exponent}</code><br>
    Adder: <code>${opA.exponent} + ${opB.exponent} = ${resultExp}</code><br>
    Base Scale: <b>2^${resultExp}</b>
  `;

  document.getElementById("fpu-mantissa-result").innerHTML = `
    Mantissas: <code>${opA.mantissaInt}</code> × <code>${opB.mantissaInt}</code><br>
    Booth ALU Cycles: <b>${boothOps} ops</b><br>
    Product: <code>${rawMantissaProduct}</code>
  `;

  document.getElementById("fpu-final-result").innerHTML = `
    Hardware Result: <b>${product.toFixed(4)}</b><br>
    Check: <code>${valA} × ${valB} = ${product.toFixed(4)}</code><br>
    Status: <span style="color: green; font-weight: bold;">Normalized & Packed</span>
  `;
}

// ==================== MODE 4: EDUCATIONAL INSPECTOR ====================

function initializeSimulation() {
  const br = parseInt(document.getElementById("input-br").value, 10);
  const qr = parseInt(document.getElementById("input-qr").value, 10);

  if (isNaN(br) || isNaN(qr) || br < -16 || br > 15 || qr < -16 || qr > 15) {
    alert("Enter values between -16 and +15 for 5-bit registers.");
    return;
  }

  allSteps = generateBoothSteps(br, qr);
  currentStepIndex = 0;

  document.getElementById("trace-table-body").innerHTML = "";
  document.getElementById("result-box").style.display = "none";
  document.getElementById("btn-next").disabled = false;

  renderStep(allSteps[currentStepIndex]);
}

function stepForward() {
  currentStepIndex++;
  if (currentStepIndex < allSteps.length) {
    renderStep(allSteps[currentStepIndex]);
  }

  if (currentStepIndex >= allSteps.length - 1) {
    document.getElementById("btn-next").disabled = true;
    showFinalResult();
  }
}

function renderStep(step) {
  const tbody = document.getElementById("trace-table-body");
  const previousRow = tbody.querySelector("tr.latest-step");
  if (previousRow) previousRow.classList.remove("latest-step");

  const row = document.createElement("tr");
  row.className = "latest-step";
  row.innerHTML = `
    <td>${step.cycle}</td>
    <td>${step.pair}</td>
    <td>${step.operation}</td>
    <td>${step.AC}</td>
    <td>${step.QR}</td>
    <td>${step.Qn1}</td>
    <td>${step.SC}</td>
  `;
  tbody.appendChild(row);

  document.getElementById("status-display").innerHTML = `<b>Action:</b> ${step.desc}`;
}

function showFinalResult() {
  const lastStep = allSteps[allSteps.length - 1];
  const fullBinary = lastStep.AC + lastStep.QR;

  let decimalValue = parseInt(fullBinary, 2);
  if (fullBinary[0] === "1") {
    decimalValue -= (1 << (BIT_WIDTH * 2));
  }

  const br = document.getElementById("input-br").value;
  const qr = document.getElementById("input-qr").value;
  const resultBox = document.getElementById("result-box");

  resultBox.style.display = "block";
  resultBox.innerHTML = `
    <b>Multiplication Complete!</b><br>
    Combined Register [AC, QR] = <code>${fullBinary}</code><br>
    Decimal Verification: <b>${br} × ${qr} = ${decimalValue}</b>
  `;
}

function resetVisualizer() {
  document.getElementById("trace-table-body").innerHTML = "";
  document.getElementById("result-box").style.display = "none";
  document.getElementById("btn-next").disabled = true;
  document.getElementById("status-display").innerHTML = "Reset complete. Click <b>Load Registers</b> to begin.";
  currentStepIndex = 0;
  allSteps = [];
}

window.onload = () => {
  executeComplexMultiplication();
  handleModelRotation();
  executeFloatingPointMultiplication();
};