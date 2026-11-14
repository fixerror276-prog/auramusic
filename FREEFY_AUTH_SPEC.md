# Freefy Reverse-Engineering Analysis: Authentication & OTP Flow

## 1. Overview & Architecture
Freefy.app's authentication system is structured around an isolated authentication card layout (`Mn`) running over their background theme (`#1e1e1e` background, `#2c2d32` card paper).

The flow consists of three distinct states:
1. **Login Mode (`q4`)**:
   - Fields: Email, Password (with eye toggle icon), "Remember me on this device" checkbox.
   - Secondary links: "Forgot your password?", "Don't have an account? Sign up."
   - Action: "Continue" pill button (`bg: #fe4559`, `color: #fff`, `rounded: 9999px`).
   - Social: Google OAuth + Demo Admin credentials.
   - If user has Two-Factor/OTP challenge enabled, transitions directly to `B4` (Two-factor challenge).

2. **Registration Mode (`tu`)**:
   - Fields: Email, Password, Confirm Password.
   - Validation: Minimum password length (5 chars), password matching confirmation.
   - Action: "Create account" pill button.
   - In strict email verification mode, transitions to OTP verification.

3. **OTP Challenge Mode (`B4` & Email OTP)**:
   - Header: "Two factor authentication" / "Verify your account".
   - Subheading: "Confirm access to your account by entering the authentication code provided to your email."
   - Inputs: 6 distinct segmented digit boxes or focused spaced code input (`#18191c`, border `#fe4559`).
   - Actions:
     - Primary button: "Continue" / "Verify & Continue".
     - Resend timer countdown: "Resend Code in (XXs)".
   - Error states:
     - Invalid OTP: "The provided two factor authentication code was invalid."
     - Expired OTP: "The authentication code has expired. Please request a new one."

## 2. Design Tokens & Visual Specifications
- **Background**: `#1e1e1e`
- **Card Paper**: `#2c2d32`
- **Primary Accent**: `#fe4559` (Hover: `#d93446`, Active scale: `0.99`)
- **Input Background**: `#1e1e1e`
- **Input Border**: `1px solid rgba(255, 255, 255, 0.14)` (Focus: `#fe4559`)
- **Button Radius**: `9999px` (Full Pill)
- **Input Radius**: `4px`
- **Card Radius**: `8px`
- **Card Max Width**: `440px`
- **Typography**: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Alert Colors**: `#ff9da8` text, `rgba(254, 69, 89, 0.18)` background, `rgba(254, 69, 89, 0.5)` border.
