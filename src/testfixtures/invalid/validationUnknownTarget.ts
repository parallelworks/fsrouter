import { Endpoint } from '../../types'

// the key should be body, so this schema would never be applied
export const validation = {
  POST: { Body: { type: 'object' } },
}

export const POST: Endpoint = async (req, res) => {
  return res.json({ message: 'Hello World!' })
}
