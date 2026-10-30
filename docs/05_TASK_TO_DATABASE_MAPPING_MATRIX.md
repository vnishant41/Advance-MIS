# Master Task-to-Database Mapping Matrix

> **Document Version:** 2.0  
> **Status:** Definitive Mapping Matrix  
> **Data Scope:** Merged mapping across `User > Commodity > Raw Table > Final Name > Frequency > Source > Cadence Rules` derived from `latest_two_dates_agalabsdev_stage` and task sample sheets.

---

## 1. Mapping Architecture & Principles

The redesign replaces all manual task logging by binding each operational task directly to a physical database table within **`agalabsdev_stage`**.

Every monitored table adheres to the following structural schema:
$$\text{Status} = \begin{cases} 
\mathbf{PASS\ (Green)} & \text{if } \text{MAX}(date\_column) \ge \text{Target Due Date} \lor \text{Admin Skipped} \\
\mathbf{FAIL\ (Red)} & \text{if } \text{MAX}(date\_column) < \text{Target Due Date} \land \text{Cutoff Elapsed} \\
\mathbf{AWAITING\ PULL} & \text{if Frequency} \in \{\text{Monthly, Yearly, Occasionally}\} \land \neg\text{Manager Pulled}
\end{cases}$$

---

## 2. Master Commodity Data Mapping Matrix

### 2.1 Pulses Research Portfolio (Primary Assignee: Nishant / IPGA Desk)

| User | Commodity | Raw Table Name in `agalabsdev_stage` | Final Business Display Name | Frequency | Date Column Identified | Latest Export Sample Date | Target Due / Cutoff Rule | Source Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Nishant** | Bengal Gram (Chana) | `pyexcel_imported_market_prices` | Imported Market Prices — Chana | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | IPGA / Market Survey |
| **Nishant** | Tur (Arhar) | `pyexcel_imported_market_prices` | Imported Market Prices — Tur | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | IPGA / Market Survey |
| **Nishant** | Urad | `pyexcel_imported_market_prices` | Imported Market Prices — Urad | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | IPGA / Market Survey |
| **Nishant** | Masoor (Lentil) | `pyexcel_imported_market_prices` | Imported Market Prices — Masoor | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | IPGA / Market Survey |
| **Nishant** | Yellow Pea | `pyexcel_imported_market_prices` | Imported Market Prices — Pea | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | IPGA / Market Survey |
| **Nishant** | Pulses | `ipga_cnf` | Pulses CNF Port Prices | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | International Port Quotes |
| **Nishant** | Pulses | `pyexcel_pulses_cnf_prices` | Detailed CNF Parity Structure | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | Overseas Brokers / Trade |
| **Nishant** | Pulses | `ipga_international_prices` | International Pulse Prices & Burma | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | Myanmar/Yangon Trade Desk |
| **Nishant** | Pulses | `ipga_spot` | Mandi Spot Price Compilation | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | Agmarknet & IPGA Mandis |
| **Nishant** | Pulses | `pyexcel_dashboard_news` | Domestic & Global Pulses News | **Daily** | `Date` | 2026-10-14 | Daily by 18:30 IST | Commodity News Feeds |
| **Nishant** | Pulses | `ipga_portstock` | Major Ports Pulses Stock | **Weekly** | `Date` | 2026-10-05 | Every Monday 17:00 IST | JNPT, Chennai, Mundra |
| **Nishant** | Pulses | `ipga_arrivals_marketwise` | Marketwise Pulses Arrivals | **Weekly** | `Date` | 2026-10-13 | Every Tuesday 18:00 IST | State APMCs / Agmarknet |
| **Nishant** | Pulses | `pystage_factrates_sowingprogress` | Weekly All-India Sowing Progress | **Weekly** | `WeekEndingDate` | 2026-10-02 | Every Friday 18:00 IST | Ministry of Agriculture |
| **Nishant** | Pulses | `ipga_chennai_manifest` | Chennai Port Vessel Manifest | **Weekly** | `EndDate` | 2026-09-22 | Every Thursday 18:00 IST | Custom Port Manifests |
| **Nishant** | Pulses | `pystage_factrates_monthly_exports` | Pulses Monthly Exports | **Monthly** | `Date` | 2024-10-01 | **Manager Pull** Required | DGCIS / APEDA |
| **Nishant** | Pulses | `pystage_factrates_monthly_imports` | Pulses Monthly Imports | **Monthly** | `Date` | 2024-10-01 | **Manager Pull** Required | Ministry of Commerce |
| **Nishant** | Pulses | `pystage_factrates_advance_estimates` | Government Advance Crop Estimates | **Quarterly**| `CreatedDate` | 2026-06-17 | **Manager Pull** Required | Directorate of Economics |
| **Nishant** | Pulses | `pyexcel_production_table_country` | Australia & Canada Crop Tables | **Yearly** | `CreatedDate` | 2026-04-06 | **Manager Pull** Required | ABARES / StatCan |
| **Nishant** | Pulses | `pyexcel_msp` | Minimum Support Price (MSP) | **Yearly** | `CreatedDate` | 2026-10-19 | **Manager Pull** Required | CACP / Cabinet Committee |

---

### 2.2 Maize, Coarse Cereals, Poultry & Feed (Primary Assignee: Nitesh)

| User | Commodity | Raw Table Name in `agalabsdev_stage` | Final Business Display Name | Frequency | Date Column Identified | Latest Export Sample Date | Target Due / Cutoff Rule | Source Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Nitesh** | Maize | `pystage_factrates_wholesaleprice` | Maize Mandi Wholesale Prices | **Daily** | `Date` | 2026-10-09 | Daily by 18:30 IST | AgriCentral / Agmarknet |
| **Nitesh** | Egg / Poultry | `pyexcel_egg_prices` | National Egg Coordination Prices | **Daily** | `Date` | 2026-10-13 | Daily by 18:00 IST | NECC Official |
| **Nitesh** | Egg / Poultry | `pyexcel_poultry` | Broiler & Poultry Feed Quotes | **Daily** | `Date` | 2026-10-13 | Daily by 18:00 IST | SMS / Breeder Association |
| **Nitesh** | Maize / Cereals | `pystage_factrates_igc_fobprice` | International IGC FOB Price | **Daily** | `Date` | 2026-10-13 | Daily by 19:00 IST | International Grains Council |
| **Nitesh** | Bajra | `pystage_factrates_spot` | Bajra Spot Mandi Price | **Daily** | `Date` | 2026-10-13 | Daily by 18:30 IST | Agmarknet |
| **Nitesh** | Barley | `pystage_factrates_retailprice` | Barley Mandi & Retail Prices | **Daily** | `Date` | 2026-10-09 | Daily by 18:30 IST | Agmarknet / APMC |
| **Nitesh** | Feed Grains | `pyexcel_ddgs_price` | DDGS Distillery Feed Prices | **Daily** | `Date` | 2026-08-29 | Daily by 18:30 IST | Ethanol Plants / Traders |
| **Nitesh** | Maize | `pystage_factrates_cme_futures` | CME Corn / Grain Futures | **Daily** | `Date` | 2026-10-13 | Daily by 19:30 IST | CME Group / Reuters |
| **Nitesh** | Logistics | `pyexcel_rakemovement` | All-India Freight Rake Movement | **Weekly** *(Roster)* | `CreatedDate` | 2026-10-14 | Weekly (or Daily Roster) | Indian Railways / FOIS |
| **Nitesh** | Maize | `pyexcel_maize_matured_rake` | Matured Maize Rakes Tracking | **Weekly** | `Date` | 2026-08-17 | Weekly by Monday 18:00 | Mandi / Rail Sidings |
| **Nitesh** | Maize | `pyexcel_port_lineup` | Indian Ports Grain Vessel Lineup | **Weekly** | `CreatedDate` | 2026-10-08 | Weekly by Wednesday 18:00 | Maritime Port Terminals |
| **Nitesh** | Cereals | `pyexcel_fob_monthly_prices` | Monthly FOB Price Compilation | **Weekly** | `date` | 2026-10-09 | Weekly by Friday 18:00 | Global Grain Desks |
| **Nitesh** | Cereals | `pyexcel_trade_flow` | Maize & Coarse Grains Trade Flow | **Monthly** | `Date` | 2026-07-01 | **Manager Pull** Required | Ministry of Commerce |
| **Nitesh** | Grains | `pyexcel_central_pool_stock` | Central Pool Foodgrain Stocks | **Monthly** | `CreatedDate` | 2026-09-21 | **Manager Pull** Required | FCI / Dept of Food |
| **Nitesh** | Maize/Barley | `pystage_factrates_usda_balancesheet` | USDA India Balancesheet | **Monthly** | `MarketYearDate` | 2027-12-01 | **Manager Pull** Required | USDA WASDE Report |
| **Nitesh** | Global Grains | `pystage_factrates_usda_balancesheet_world` | USDA World Balancesheet | **Monthly** | `MarketYearDate` | 2026-08-01 | **Manager Pull** Required | USDA Foreign Ag Service |
| **Nitesh** | Cereals | `pyexcel_key_producing_countries` | Major Producing Countries Outlook | **Monthly** | `CreatedDate` | 2026-10-13 | **Manager Pull** Required | FAO / AMIS |
| **Nitesh** | Maize | `pyexcel_igc_outlook` | IGC Maize Market Outlook | **Monthly** | `CreatedDate` | 2026-09-21 | **Manager Pull** Required | IGC Grain Reports |
| **Nitesh** | Macro | `pyexcel_cpi` | Consumer Price Index (CPI/WPI) | **Monthly** | `CreatedDate` | 2026-10-13 | **Manager Pull** Required | MoSPI Official |
| **Nitesh** | Biofuels | `pyexcel_ethanol_basic_price` | Basic Ethanol Procurement Price | **Monthly** | `CreatedDate` | 2025-12-03 | **Manager Pull** Required | OMCs (IOCL/BPCL/HPCL) |
| **Nitesh** | Biofuels | `pyexcel_ethanol_recap` | Cyclewise Ethanol Supply Recap | **Monthly** | `CreatedDate` | 2026-02-23 | **Manager Pull** Required | Ministry of Petroleum |

---

### 2.3 Soybeans, Rapeseed & Edible Oils Portfolio

| User | Commodity | Raw Table Name in `agalabsdev_stage` | Final Business Display Name | Frequency | Date Column Identified | Latest Export Sample Date | Target Due / Cutoff Rule | Source Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Assigned Analyst** | Soybeans | `sopa_spot_price` | SOPA Soybean Spot Mandi Rates | **Daily** | `Date` | 2026-10-14 | Daily by 18:00 IST | SOPA Indore |
| **Assigned Analyst** | Soybeans | `pyexcel_soybean_basis` | Soybean FOB & Basis Rates | **Daily** | `date` | 2026-08-11 | Daily by 18:30 IST | Trade Brokers |
| **Assigned Analyst** | Soybeans | `pyexcel_soybean_plant_quote` | Crushing Plant Delivery Quotes | **Daily** | `Date` | 2026-08-29 | Daily by 18:00 IST | Solvent Extractors |
| **Assigned Analyst** | Oilseeds | `pystage_oilseed_crush_margin` | Oilseed Crushing Margin Calculation | **Daily** | `date` | 2026-10-13 | Daily by 19:00 IST | Proprietary Model / SOPA |
| **Assigned Analyst** | Soybeans | `sopa_arrivalsbystate` | State-wise Soybean Arrivals | **Weekly** | `Date` | 2019-06-01 | Weekly by Monday 18:00 | SOPA Survey |
| **Assigned Analyst** | Edible Oils | `pyexcel_price_influencing_factors` | Macro Price Influencing Matrix | **Weekly** | `Date` | 2026-10-14 | Weekly by Friday 18:00 | Research Desk Analysis |
| **Assigned Analyst** | Edible Oils | `pyexcel_edible_oil_tariff_structure` | Government Tariff Value Structure | **Fortnightly**| `createdDate` | 2026-09-16 | **Manager Pull** Required | CBIC Notifications |
| **Assigned Analyst** | Soybeans | `sopa_balancesheet` | SOPA Soybean India Balancesheet | **Monthly** | `MarketYearDate` | 2025-01-01 | **Manager Pull** Required | SOPA Indore |
| **Assigned Analyst** | Soybeans | `sopa_balancesheet_world` | Global Soybean Supply/Demand | **Monthly** | `MarketYearDate` | 2027-01-01 | **Manager Pull** Required | USDA / Oil World |
| **Assigned Analyst** | Soymeal | `pyexcel_soybean_meal_export` | Soybean De-Oiled Cake Exports | **Monthly** | `Date` | 2026-02-01 | **Manager Pull** Required | SEA of India |

---

### 2.4 Sugar, Bio-Energy & Horticulture

| User | Commodity | Raw Table Name in `agalabsdev_stage` | Final Business Display Name | Frequency | Date Column Identified | Latest Export Sample Date | Target Due / Cutoff Rule | Source Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Assigned Analyst** | Sugar | `pystage_factrates_iso_sugar` | ISO Sugar & White Sugar Index | **Daily** | `Date` | 2026-10-12 | Daily by 18:30 IST | International Sugar Org |
| **Assigned Analyst** | Energy | `pyexcel_crude_oil_prices` | Brent & WTI Crude Oil Prices | **Daily** | `Date` | 2026-10-12 | Daily by 19:00 IST | NYMEX / ICE |
| **Assigned Analyst** | Sugar | `pyexcel_government_monthly_sugar_sale_quota` | Monthly Domestic Sugar Sale Quota | **Monthly** | `Date` | 2026-10-01 | **Manager Pull** Required | DFPD / Food Ministry |
| **Assigned Analyst** | Sugar | `pyexcel_sugar_mill_distillery` | Sugar Mill & Attached Distillery Status | **Monthly**| `CreatedDate` | 2025-11-21 | **Manager Pull** Required | ISMA Reports |
| **Assigned Analyst** | Vegetables | `pyexcel_tops_prices` | Tomato, Onion, Potato (TOPS) Mandi | **Daily** | `Date` | 2026-02-25 | Daily by 18:30 IST | NHB / Agmarknet |

---

### 2.5 GIS, Weather & Environmental Surveillance (Assignees: Deep / Manish / Priyanshi)

| User | Commodity | Raw Table Name in `agalabsdev_stage` | Final Business Display Name | Frequency | Date Column Identified | Latest Export Sample Date | Target Due / Cutoff Rule | Source Origin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Deep / Manish** | Weather | `pyexcel_daily_weather_data` | All-India Daily Weather Parameters | **Daily** | `Date` | 2026-10-04 | Daily by 10:00 IST | IMD Pune |
| **Deep / Manish** | Weather | `pyexcel_factrates_rainfall_district` | Districtwise Actual Rainfall | **Daily** | `Date` | 2026-10-14 | Daily by 11:30 IST | IMD Hydromet |
| **Deep / Manish** | Weather | `pystage_factrates_rainfall_region` | Regional Cumulative Rainfall Matrix | **Daily** | `CreatedDate` | 2023-11-22 | Daily by 12:00 IST | IMD Regional Divisions |
| **Priyanshi** | GIS / Crop | `pyexcel_gis_ndvi` | MODIS / Sentinel NDVI Indices | **Weekly** | `Date` | 2026-06-26 | Every Monday 14:00 IST | Satellite Earth Engine |
| **Priyanshi** | GIS / Ground | `pyexcel_gis_gt_points` | Field Survey Ground Truth Data | **Weekly** | `survey_date` | 2025-12-10 | Every Friday 18:00 IST | Mobile App Surveys |

---

## 3. Implementation of the Merged Verification Logic

When the MIS renders the Crishi Database table, it executes a single unified SQL batch or uses indexed caching:

```sql
-- Dynamic status evaluation query executed against each registered table
SELECT 
    '{raw_table}' AS table_name,
    MAX(`{date_column}`) AS last_updated_date,
    CASE 
        WHEN MAX(`{date_column}`) >= '{expected_due_date}' THEN 'PASS'
        ELSE 'FAIL'
    END AS computed_status
FROM `agalabsdev_stage`.`{raw_table}`
WHERE `{date_column}` IS NOT NULL 
  AND `{date_column}` != '0000-00-00';
```
*(If an active `Admin Skip` record exists for the date, `computed_status` is forced to `PASS` with the skip badge).*
