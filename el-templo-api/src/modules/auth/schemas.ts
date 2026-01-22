export const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'branchId'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      branchId: { type: 'integer' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
    },
  },
};

export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
};
