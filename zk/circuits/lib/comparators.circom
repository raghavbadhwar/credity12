pragma circom 2.1.6;

// Minimal comparator library (no circomlib dependency)

template AssertBit() {
    signal input in;
    in * (in - 1) === 0;
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];

    var lc = 0;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lc += out[i] * (1 << i);
    }

    in === lc;
}

template LessThan(n) {
    signal input in[2]; // in[0] < in[1]
    signal output out;

    // out = 1 iff in0 < in1
    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + (1 << n) - in[1];
    out <== 1 - n2b.out[n];
}

template GreaterEq(n) {
    signal input in[2]; // in[0] >= in[1]
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[0];
    lt.in[1] <== in[1];
    out <== 1 - lt.out;
}

template LessEq(n) {
    signal input in[2]; // in[0] <= in[1]
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[1];
    lt.in[1] <== in[0];
    out <== 1 - lt.out;
}
