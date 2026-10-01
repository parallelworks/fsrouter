import { Endpoint } from '../../types'

export const guestAccess = true
export const ensureAdmin = true

export const GET: Endpoint = async (req, res) => {
  return res.json({})
}
