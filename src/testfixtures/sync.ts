import { Endpoint } from '../types'

// neither of these handlers is async
export const GET: Endpoint = [
  (req, res, next) => next(),
  (req, res) => {
    res.json({ message: 'Hello World!' })
  },
]
