import { Endpoint } from '../../types'

// there is no POST handler for this validation to apply to
export const validation = {
  POST: { body: { type: 'object' } },
}

export const GET: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello World!' })
}
