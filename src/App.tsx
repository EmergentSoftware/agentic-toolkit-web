import { Route, Routes } from 'react-router';

export function App() {
  return (
    <Routes>
      <Route element={<HelloWorld />} path='/' />
    </Routes>
  );
}

function HelloWorld() {
  return (
    <main className='flex min-h-screen items-center justify-center p-8'>
      <h1 className='text-4xl font-semibold tracking-tight'>Hello, Agentic Toolkit Web</h1>
    </main>
  );
}
