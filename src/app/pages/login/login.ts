import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements OnInit {
  // Tabs: 'login' | 'signup'
  activeTab: 'login' | 'signup' = 'signup';
  
  // Login Role: 'doctor' | 'admin'
  loginRole: 'doctor' | 'admin' = 'doctor';

  loginData = {
    email: '',
    password: '',
    rememberMe: false
  };

  signupData = {
    name: '',
    contact: '',
    email: '',
    password: ''
  };

  loginError: string | null = null;
  signupError: string | null = null;
  emailValidationError: string | null = null;
  contactValidationError: string | null = null;
  passwordValidationError: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Read optional role query parameter
    this.route.queryParams.subscribe(params => {
      if (params['role'] === 'admin') {
        this.loginRole = 'admin';
        this.loginData.email = 'admin@pharmacy.com';
        this.loginData.password = 'Admin@123';
      } else {
        this.loginRole = 'doctor';
        this.loginData.email = '';
        this.loginData.password = '';
      }
      
      if (params['tab'] === 'login') {
        this.activeTab = 'login';
      } else {
        this.activeTab = 'signup';
      }
    });
  }

  setTab(tab: 'login' | 'signup') {
    this.activeTab = tab;
    this.loginError = null;
    this.signupError = null;
  }

  setLoginRole(role: 'doctor' | 'admin') {
    this.loginRole = role;
    this.loginError = null;
    if (role === 'admin') {
      this.loginData.email = 'admin@pharmacare.com';
      this.loginData.password = 'admin123';
    } else {
      this.loginData.email = '';
      this.loginData.password = '';
    }
  }

  validateContact(contact: string): boolean {
    const contactRegex = /^\d{10}$/;
    if (!contact) {
      this.contactValidationError = 'Contact number is required';
      return false;
    }
    if (!contactRegex.test(contact)) {
      this.contactValidationError = 'Contact must be exactly 10 digits';
      return false;
    }
    this.contactValidationError = null;
    return true;
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      this.emailValidationError = 'Email is required';
      return false;
    }
    if (!email.includes('@')) {
      this.emailValidationError = 'Email must contain @ symbol';
      return false;
    }
    if (!emailRegex.test(email)) {
      this.emailValidationError = 'Please enter a valid email format';
      return false;
    }
    this.emailValidationError = null;
    return true;
  }

  validatePassword(password: string): boolean {
    if (!password) {
      this.passwordValidationError = 'Password is required';
      return false;
    }
    if (password.length < 4) {
      this.passwordValidationError = 'Password must be at least 4 characters';
      return false;
    }
    this.passwordValidationError = null;
    return true;
  }

  private extractErrorMessage(err: any): string {
    if (!err) return 'An unexpected error occurred.';
    
    // If the error body is a JSON object with field validation messages
    if (err.error && typeof err.error === 'object') {
      const messages = Object.values(err.error);
      if (messages.length > 0) {
        return messages.join('. ');
      }
    }
    
    // If the error body is a simple raw string message
    if (err.error && typeof err.error === 'string') {
      return err.error;
    }
    
    // Fallback to parsed status or default message
    return err.message || 'Request failed. Please check your inputs.';
  }

  onLogin() {
    this.loginError = null;
    if (!this.validateEmail(this.loginData.email)) {
      return;
    }

    this.authService.login({
      email: this.loginData.email,
      password: this.loginData.password
    }).subscribe({
      next: (user) => {
        console.log('Login successful:', user);
        if (user.role === 'admin') {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigate(['/doctor']);
        }
      },
      error: (err) => {
        this.loginError = this.extractErrorMessage(err);
      }
    });
  }

  onSignup() {
    this.signupError = null;
    
    // Run frontend validation checks
    const isEmailValid = this.validateEmail(this.signupData.email);
    const isContactValid = this.validateContact(this.signupData.contact);
    const isPasswordValid = this.validatePassword(this.signupData.password);
    
    if (!isEmailValid || !isContactValid || !isPasswordValid) {
      this.signupError = 'Please correct the validation errors above before signing up.';
      return;
    }
    
    // Register as Doctor
    this.authService.register({
      name: this.signupData.name,
      email: this.signupData.email,
      contact: this.signupData.contact,
      password: this.signupData.password,
      role: 'doctor'
    }).subscribe({
      next: (user) => {
        console.log('Registration successful:', user);
        alert('Registration successful! Please log in with your credentials.');
        // Navigate to login view
        this.setTab('login');
        this.loginData.email = this.signupData.email;
        this.loginData.password = '';
      },
      error: (err) => {
        this.signupError = this.extractErrorMessage(err);
      }
    });
  }
}
