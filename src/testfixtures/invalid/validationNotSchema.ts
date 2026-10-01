import { Endpoint } from '../../types'

export const validation = {
  GET: { query: 'name' },
}

export const GET: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello World!' })
}
