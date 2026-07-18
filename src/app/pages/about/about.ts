import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class AboutComponent {
  careers = [
    { role: 'Senior Angular Developer', dept: 'Engineering', loc: 'Remote / Ahmedabad', desc: 'Build reactive health dashboards and clinical charting UI solutions.' },
    { role: 'Product Manager - Health Tech', dept: 'Product', loc: 'Ahmedabad, India', desc: 'Own integrations with state ABDM standards and API gateway systems.' },
    { role: 'Sales Account Executive', dept: 'Sales', loc: 'Mumbai / Pune', desc: 'Expand local pharmacy adoption of our Cloud ERP software suites.' }
  ];
}
