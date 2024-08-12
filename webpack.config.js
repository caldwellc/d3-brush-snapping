// webpack.config.js
module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'd3-brush-snapping.js',
        library: {
            type: 'umd',
            name: 'd3BrushSnapping',
        },
        // prevent error: `Uncaught ReferenceError: self is not define`
        globalObject: 'this',
    },
};