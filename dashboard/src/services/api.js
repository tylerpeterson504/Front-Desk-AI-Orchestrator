import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

export const templatesAPI = {
  getAll: () => api.get('/api/templates'),
  create: (data) => api.post('/api/templates', data),
  update: (id, data) => api.put(`/api/templates/${id}`, data),
  delete: (id) => api.delete(`/api/templates/${id}`)
};

export const auditAPI = {
  getLogs: (limit = 100, offset = 0) =>
    api.get('/api/audit', { params: { limit, offset } })
};

export default api;
