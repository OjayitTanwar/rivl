module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      require.resolve("babel-preset-expo", {
        paths: [require.resolve("expo/package.json")],
      }),
    ],
    plugins: [
      function ({ types: t }) {
        return {
          name: "maplibre-web-worker-url",
          visitor: {
            MetaProperty(path, state) {
              if (
                state.filename?.includes("maplibre-gl") &&
                path.node.meta.name === "import"
              ) {
                path.replaceWith(
                  t.objectExpression([
                    t.objectProperty(
                      t.identifier("url"),
                      t.binaryExpression(
                        "+",
                        t.memberExpression(
                          t.memberExpression(
                            t.identifier("globalThis"),
                            t.identifier("location"),
                          ),
                          t.identifier("origin"),
                        ),
                        t.stringLiteral("/maplibre/maplibre-gl.mjs"),
                      ),
                    ),
                  ]),
                );
              }
            },
          },
        };
      },
    ],
  };
};
