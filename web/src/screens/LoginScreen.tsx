import { useState } from 'react';
import type { useAuth } from '../hooks/useAuth';

type AuthAPI = ReturnType<typeof useAuth>;

export function LoginScreen({ loginEmail, loginGoogle }: Pick<AuthAPI, 'loginEmail' | 'loginGoogle'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await loginEmail(email, password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-20 px-6">
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Sign In</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="block w-full px-3 py-2.5 mb-3 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="block w-full px-3 py-2.5 mb-3 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button type="submit" className="block w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
          Sign In
        </button>
      </form>
      <hr className="border-gray-800 my-6" />
      <button
        onClick={() => loginGoogle()}
        className="block w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Sign in with Google
      </button>
      <p className="mt-4 text-xs text-gray-500">
        Test: test1@user.com / test123 or test2@user.com / test123
      </p>
    </div>
  );
}
