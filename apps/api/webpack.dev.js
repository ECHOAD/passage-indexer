const path = require("path");
const { NODE_ENV = "development" } = process.env;
const NodemonPlugin = require("nodemon-webpack-plugin");
const nodeExternals = require("webpack-node-externals");
const hq = require("alias-hq");

module.exports = {
  entry: "./src/index.ts",
  mode: NODE_ENV,
  target: "node",
  devtool: "source-map",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: hq.get("webpack"),
  },
  externals: [
    nodeExternals({
      allowlist: ["database"],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
  plugins: [new NodemonPlugin()],
};
