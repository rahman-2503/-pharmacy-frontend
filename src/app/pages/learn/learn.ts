import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-learn',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './learn.html',
  styleUrl: './learn.css'
})
export class LearnComponent {
  caseStudies = [
    { title: 'Maruthi Medicals', location: 'Bengaluru, Karnataka', challenge: 'High inventory overhead, pharmacy queues, and medicine expiry losses.', solution: 'Deployed pharmacare Smart Inventory with auto-expire alerts and barcode billing counters.', results: ['99.8% billing accuracy achieved', '40% reduction in customer check-out queues', 'Saved ₹1.8 Lakhs in expiry returns over 6 months'] },
    { title: "Dr. Khatri's Clinic", location: 'Pune, Maharashtra', challenge: 'Manual transcription of prescriptions leading to dispatch errors.', solution: 'Integrated Direct Clinic Prescription Sync through FHIR compliant API pathways.', results: ['Zero transcription dispatch errors', '30% increase in outpatient daily orders', 'Improved patient satisfaction and trust score'] },
    { title: 'Goyal Medical', location: 'Delhi NCR', challenge: 'High waste index of rare drugs due to slow rotation.', solution: 'Enabled ONDC supplier integrations and SMS dosage alerts to patients.', results: ['₹2.5 Lakhs saved in inventory decay', 'Double-digit patient retention growth', 'Connected direct billing sync with wholesale suppliers'] },
    { title: 'Jeevan Rekha Pharmacy', location: 'Ahmedabad, Gujarat', challenge: 'Managing centralized inventory and drug audits across 5 retail stores.', solution: 'Set up Multi-Location Chain Sync with unified product configurations and sales reports.', results: ['Centralized warehouse inventory audit completed in hours instead of days', 'Uniform pricing updates in real-time across all locations', 'Comprehensive visual sales reports on owner dashboard'] }
  ];

  videos = [
    { title: 'Introduction to pharmacare ERP', duration: '5:24', desc: 'A quick tour of the features, user roles, dashboards, and settings.' },
    { title: 'How to Manage Smart Inventory & Batches', duration: '8:15', desc: 'Tutorial on adding drugs, setting up supplier contacts, batch numbers, and expiry alerts.' },
    { title: 'Billing Counters & WhatsApp Integration', duration: '4:42', desc: 'Demonstrating how to complete checkouts, use barcodes, and trigger digital receipts.' }
  ];
}
