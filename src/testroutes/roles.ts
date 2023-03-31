import { Endpoint } from '../types'

export const roles = {
  POST: ['org:admin', 'org:settings'],
}

export const GET: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello Unauthorized World!' })
}

export const POST: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello Authorized World!' })
}
