import { Endpoint } from '../../../types'

export const GET: Endpoint = async (req, res) => {
  return res.json({ route: 'users/2fa' })
}
