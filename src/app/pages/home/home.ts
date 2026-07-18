import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent {
  pharmacyTypes = [
    { title: 'Retail Pharmacy', icon: '🏪', desc: 'Optimized for operations with up to 3 staff members. Simple, fast, and secure.' },
    { title: 'Large Retail Pharmacy', icon: '🏢', desc: 'Designed for high volume sales (₹50K+ daily) with advanced tracking & queues.' },
    { title: 'Chain Pharmacy', icon: '🌐', desc: 'Multi-location centralized inventory, unified pricing management, and global reports.' },
    { title: 'Clinical Pharmacy', icon: '🏥', desc: 'Clinic-attached workflow with direct prescription import and doctor sync.' }
  ];

  features = [
    { title: 'Smart Inventory', icon: '⚡', desc: 'Automated expiry alerts, low-stock reminders, and intelligent distributor order sheets.' },
    { title: 'Compliance Made Simple', icon: '📜', desc: 'Automated drug schedule logging, GST filing support, and licensing checks.' },
    { title: 'Intuitive Billing', icon: '💰', desc: 'Barcode support, rapid search, split payments, and instant digital receipts.' },
    { title: 'Advanced CRM', icon: '👥', desc: 'Loyalty points, dosage reminders via SMS/WhatsApp, and patient history logs.' }
  ];

  news = [
    { date: 'June 24, 2026', title: 'Accelerating ERP Adoption in Retail Pharmacies', desc: 'How cloud-based systems are helping local pharmacies compete with online corporate giants.' },
    { date: 'May 18, 2026', title: 'The Role of AI in Drug Dispensing and Compliance', desc: 'Using predictive models to manage inventory stock levels and automate regulatory logging.' },
    { date: 'April 05, 2026', title: 'ONDC Integration: Opening New Digital Frontiers', desc: 'Local pharmacies can now join the open digital network, unlocking thousands of local online orders.' }
  ];

  certifications = [
    { name: 'NHA Approved', icon: '🏛️' },
    { name: 'ABDM Compliant', icon: '🛡️' },
    { name: 'AWS Secured', icon: '☁️' },
    { name: 'FHIR Compliant', icon: '📄' },
    { name: 'Google Opted', icon: '🌐' }
  ];

  trustedLogos = [
    'Apollo Pharmacy', 'MedPlus', 'Wellness Forever', 'Netmeds', 'Fortis Health', 'Max Pharmacy'
  ];
}
