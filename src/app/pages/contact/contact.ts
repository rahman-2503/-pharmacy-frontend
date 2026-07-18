import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class ContactComponent {
  formData = {
    name: '',
    email: '',
    phone: '',
    pharmacyName: '',
    message: ''
  };
  submitted = false;

  onSubmit() {
    console.log('Contact form submitted:', this.formData);
    this.submitted = true;
    setTimeout(() => {
      this.submitted = false;
      this.formData = { name: '', email: '', phone: '', pharmacyName: '', message: '' };
    }, 4000);
  }
}
