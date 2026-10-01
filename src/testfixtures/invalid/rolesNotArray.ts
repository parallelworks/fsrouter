import { Endpoint } from '../../types'

export const roles = {
  GET: 'org:admin',
}

export const GET: Endpoint = async (req, res) => {
  return res.json({})
}
