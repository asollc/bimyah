// Loader hooks so Node/tsx can import app modules that reference
// static assets: assets become empty default exports.
export async function load(url, context, next) {
  if (/\.(webp|png|jpe?g|gif|svg|css)$/.test(url)) {
    return { format: "module", source: "export default '';", shortCircuit: true };
  }
  return next(url, context);
}
