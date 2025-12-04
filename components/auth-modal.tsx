"use client"

import type React from "react"
import { getDoc } from "firebase/firestore"
import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { auth, googleProvider, db } from "@/lib/firebase"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: "login" | "register"
}

export function AuthModal({ isOpen, onClose, initialTab = "login" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Login form
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Register form
  const [registerName, setRegisterName] = useState("")
  const [registerEmail, setRegisterEmail] = useState("")
  const [registerPassword, setRegisterPassword] = useState("")
  const [registerPhone, setRegisterPhone] = useState("")

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword)
      onClose()
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.")
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, registerEmail, registerPassword)
      const user = userCredential.user

      // Update profile with display name
      await updateProfile(user, {
        displayName: registerName,
      })

      // Store additional user data including phone number in Firestore
      await setDoc(doc(db, "users", user.uid), {
        name: registerName,
        email: registerEmail,
        phone: registerPhone,
        createdAt: new Date().toISOString(),
        balance: 0,
      })

      onClose()
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError("")
    setLoading(true)

    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user

      // Check if user document exists, if not create one
      const userDocRef = doc(db, "users", user.uid)
      const existingDoc = await getDoc(userDocRef)

      const userData = {
        name: user.displayName || "",
        email: user.email || "",
        phone: "", // User can add phone later in profile
        createdAt: new Date().toISOString(),
      }

      // If user exists, preserve their balance; if new user, set to 10000
      if (!existingDoc.exists()) {
        userData.balance = 10000 // New users start with 10000
      }

      await setDoc(userDocRef, userData, { merge: true })

      onClose()
    } catch (err: any) {
      setError(err.message || "Google login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1c33] border border-[#1a2942] rounded-lg w-full max-w-md relative">
        {/* Close button */}
        <button onClick={onClose} className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header with tabs */}
        <div className="border-b border-[#1a2942] p-6 pb-0">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab("login")}
              className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
                activeTab === "login" ? "text-[#d946ef]" : "text-gray-400 hover:text-white"
              }`}
            >
              LOGIN
              {activeTab === "login" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d946ef]" />}
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
                activeTab === "register" ? "text-[#d946ef]" : "text-gray-400 hover:text-white"
              }`}
            >
              REGISTER
              {activeTab === "register" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d946ef]" />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">{error}</div>
          )}

          {activeTab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="login-email" className="text-sm text-gray-300 mb-1.5 block">
                  Email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="Enter your email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <div>
                <Label htmlFor="login-password" className="text-sm text-gray-300 mb-1.5 block">
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#fbbf24] text-black hover:bg-[#f59e0b] font-medium"
              >
                {loading ? "Logging in..." : "LOGIN"}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1a2942]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#0f1c33] px-2 text-gray-400">OR</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full border-[#2a3952] bg-transparent hover:bg-[#1a2942] text-white"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <Label htmlFor="register-name" className="text-sm text-gray-300 mb-1.5 block">
                  Full Name
                </Label>
                <Input
                  id="register-name"
                  type="text"
                  placeholder="Enter your full name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <div>
                <Label htmlFor="register-email" className="text-sm text-gray-300 mb-1.5 block">
                  Email
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="Enter your email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <div>
                <Label htmlFor="register-phone" className="text-sm text-gray-300 mb-1.5 block">
                  Phone Number
                </Label>
                <Input
                  id="register-phone"
                  type="tel"
                  placeholder="Enter phone number for deposits/withdrawals"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  required
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <div>
                <Label htmlFor="register-password" className="text-sm text-gray-300 mb-1.5 block">
                  Password
                </Label>
                <Input
                  id="register-password"
                  type="password"
                  placeholder="Create a password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-[#1a2942] border-[#2a3952] text-white"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#d946ef] text-white hover:bg-[#c026d3] font-medium"
              >
                {loading ? "Creating account..." : "CREATE ACCOUNT"}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1a2942]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#0f1c33] px-2 text-gray-400">OR</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full border-[#2a3952] bg-transparent hover:bg-[#1a2942] text-white"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
