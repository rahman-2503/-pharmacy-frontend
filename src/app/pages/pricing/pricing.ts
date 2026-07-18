import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css'
})
export class PricingComponent {
  plans = [
    { name: 'Capsule', price: '₹7,500', term: 'year', desc: 'Essential inventory & billing tools for retail shops.', features: ['Up to 3 staff', 'Smart Inventory', 'Basic Billing', 'WhatsApp Receipts', 'Email support', '1 database location'] },
    { name: 'Injection', price: '₹15,000', term: 'year', desc: 'Advanced CRM and supplier matching for growing pharmacies.', features: ['Unlimited staff', 'CRM & Loyalty Program', 'Full GST filing', 'Supplier Integration', 'Priority email support', 'API sync (basic)'], recommended: true },
    { name: 'Vaccine', price: '₹30,000', term: 'year', desc: 'Multi-store sync and integrations for chain stores.', features: ['Multi-location sync', 'Clinical prescription import', 'Advanced analytics', '24/7 phone support', 'SMS gateway integrations', '5 database locations'] },
    { name: 'Steroid', price: '₹50,000', term: 'year', desc: 'Custom enterprise API integrations and dedicated hosting.', features: ['Custom API access', 'Dedicated server setup', 'Google / AWS cloud integrations', 'SLA guaranteed uptime', 'Dedicated account manager', 'Unlimited database locations'] }
  ];
}
