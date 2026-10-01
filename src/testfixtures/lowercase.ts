import { Endpoint } from '../types'

export const guestAccess = true

export const roles = {
  POST: ['org:admin'],
}

export const validation = {
  post: {
    query: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
}

// the export is lowercase, but the roles and validation above still apply to it
export const post: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello Authorized World!' })
}
