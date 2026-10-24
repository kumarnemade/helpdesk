import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

// Better Auth is mocked: no session, and sign-in resolves however a test says.
const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
  signInEmail: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: auth.useSession,
    signIn: { email: auth.signInEmail },
  },
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.useSession.mockReset().mockReturnValue({ data: null, isPending: false })
  auth.signInEmail.mockReset().mockResolvedValue({ data: {}, error: null })
})

describe('LoginPage', () => {
  it('shows the sign-in form with a masked password', () => {
    renderPage()

    expect(screen.getByText('Sign in to your Helpdesk account.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('flags both empty fields without signing in', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(auth.signInEmail).not.toHaveBeenCalled()
  })

  it('flags only an invalid email', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'whatever-123456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
    expect(auth.signInEmail).not.toHaveBeenCalled()
  })

  it('flags only a missing password', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('clears a field error once the input is corrected', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Enter a valid email address')

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')

    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('signs in with the Enter key and goes to the home page', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-password{Enter}')

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(auth.signInEmail).toHaveBeenCalledWith({ email: 'agent@example.com', password: 'correct-password' })
  })

  it("shows the server's error message and stays on the page", async () => {
    const user = userEvent.setup()
    auth.signInEmail.mockResolvedValue({ data: null, error: { message: 'Invalid email or password' } })
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
  })

  it('falls back to a generic message when the error has none', async () => {
    const user = userEvent.setup()
    auth.signInEmail.mockResolvedValue({ data: null, error: { message: '' } })
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('signs in after a failed attempt', async () => {
    const user = userEvent.setup()
    auth.signInEmail.mockResolvedValueOnce({ data: null, error: { message: 'Invalid email or password' } })
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('alert')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(auth.signInEmail).toHaveBeenCalledTimes(2)
  })

  it('disables the button and shows a loading label while signing in', async () => {
    const user = userEvent.setup()
    auth.signInEmail.mockReturnValue(new Promise(() => {}))
    renderPage()

    await user.type(screen.getByLabelText('Email'), 'agent@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })
})
