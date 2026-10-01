// a helper that lives next to the routes, its exports only look like method handlers
export const get = async (req, res) => {
  return res.json({ route: '_lib/helper' })
}
