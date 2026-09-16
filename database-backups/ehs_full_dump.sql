--
-- PostgreSQL database dump
--

\restrict QJ4KXWrJvEbsjovTRL90ydJBjMeY1aDMGkiTUs6GRWUe90ih3hndSv3FfFKLmAt

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: authentication_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authentication_events (
    id bigint NOT NULL,
    user_id bigint,
    username_attempted character varying(255),
    event_type character varying(50) NOT NULL,
    success boolean NOT NULL,
    ip_address inet,
    user_agent text,
    event_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authentication_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['SIGNUP'::character varying, 'LOGIN'::character varying, 'LOGOUT'::character varying, 'LOGIN_FAILURE'::character varying])::text[])))
);


--
-- Name: authentication_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.authentication_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: authentication_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.authentication_events_id_seq OWNED BY public.authentication_events.id;


--
-- Name: closure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.closure_requests (
    id bigint NOT NULL,
    observation_report_id bigint NOT NULL,
    patrol_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    proposed_closure_date date,
    action_plan text,
    status character varying(50) DEFAULT 'REQUESTED'::character varying NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by bigint,
    reviewed_at timestamp with time zone,
    review_comments text,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    responsible_hod_name character varying(255),
    target_date date,
    completion_date date,
    action_plan_saved_at timestamp with time zone,
    submitted_for_closure_at timestamp with time zone,
    approval_iteration integer DEFAULT 0 NOT NULL,
    approved_at timestamp with time zone,
    CONSTRAINT closure_request_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'IN_PROGRESS'::character varying, 'SUBMITTED_FOR_CLOSURE'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'REEXAMINATION_REQUIRED'::character varying])::text[])))
);


--
-- Name: closure_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.closure_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: closure_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.closure_requests_id_seq OWNED BY public.closure_requests.id;


--
-- Name: observation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.observation_reports (
    id bigint NOT NULL,
    patrol_id bigint NOT NULL,
    submitted_by bigint NOT NULL,
    submitted_to bigint NOT NULL,
    status character varying(50) DEFAULT 'OPEN'::character varying NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    report_number character varying(50),
    finding_date date,
    plant_location character varying(50),
    observation_location text,
    category character varying(2),
    photograph_path text,
    photograph_original_name text,
    photograph_mime_type character varying(100),
    photograph_size bigint,
    description text,
    risk_category character varying(20),
    closed_at timestamp with time zone,
    CONSTRAINT observation_report_category_check CHECK (((category IS NULL) OR ((category)::text = ANY ((ARRAY['UA'::character varying, 'UC'::character varying])::text[])))),
    CONSTRAINT observation_report_plant_location_check CHECK (((plant_location IS NULL) OR ((plant_location)::text = ANY ((ARRAY['Gurugram'::character varying, 'Pune'::character varying, 'Chennai'::character varying, 'Manesar'::character varying, 'China'::character varying])::text[])))),
    CONSTRAINT observation_report_risk_check CHECK (((risk_category IS NULL) OR ((risk_category)::text = ANY ((ARRAY['HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[])))),
    CONSTRAINT observation_report_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'PENDING_AUDITEE_ACTION'::character varying, 'PENDING_EHS_APPROVAL'::character varying, 'REEXAMINATION_REQUIRED'::character varying, 'CLOSED'::character varying])::text[])))
);


--
-- Name: observation_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.observation_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: observation_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.observation_reports_id_seq OWNED BY public.observation_reports.id;


--
-- Name: patrols; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patrols (
    id bigint NOT NULL,
    unit_id bigint NOT NULL,
    zone_id bigint NOT NULL,
    auditor_id bigint NOT NULL,
    auditee_id bigint NOT NULL,
    scheduled_date date NOT NULL,
    status character varying(50) DEFAULT 'SCHEDULED'::character varying NOT NULL,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ehs_officer_id bigint,
    plant_location character varying(50),
    area_detail character varying(100),
    CONSTRAINT patrol_auditor_auditee_check CHECK ((auditor_id <> auditee_id)),
    CONSTRAINT patrol_status_check CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'IN_PROGRESS'::character varying, 'PENDING_AUDITEE_ACTION'::character varying, 'PENDING_EHS_APPROVAL'::character varying, 'REEXAMINATION_REQUIRED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT patrols_area_detail_check CHECK (((area_detail IS NULL) OR ((area_detail)::text = ANY ((ARRAY['ETP area'::character varying, 'Maintenance Store'::character varying, 'Utility'::character varying, 'Forge Shop'::character varying, 'Machine shop'::character varying, 'Heat Treatment'::character varying, 'Die Shop'::character varying, 'Tool Shop'::character varying, 'OSP Store'::character varying])::text[])))),
    CONSTRAINT patrols_plant_location_check CHECK (((plant_location IS NULL) OR ((plant_location)::text = ANY ((ARRAY['Gurugram'::character varying, 'Manesar'::character varying, 'Chennai'::character varying, 'Pune'::character varying, 'China'::character varying])::text[]))))
);


--
-- Name: patrols_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patrols_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patrols_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patrols_id_seq OWNED BY public.patrols.id;


--
-- Name: plants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plants (
    id bigint NOT NULL,
    name character varying(150) NOT NULL,
    code character varying(50) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plants_id_seq OWNED BY public.plants.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id bigint NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id bigint NOT NULL,
    plant_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    code character varying(50) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_number character varying(50)
);


--
-- Name: units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.units_id_seq OWNED BY public.units.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id bigint NOT NULL,
    role_id bigint NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    full_name character varying(150) NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    authentication_source character varying(30) DEFAULT 'LOCAL'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_authentication_source_check CHECK (((authentication_source)::text = ANY ((ARRAY['LOCAL'::character varying, 'ENTRA'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id bigint NOT NULL,
    unit_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    code character varying(50) NOT NULL,
    area_detail text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    zone_number character varying(50)
);


--
-- Name: zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zones_id_seq OWNED BY public.zones.id;


--
-- Name: authentication_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_events ALTER COLUMN id SET DEFAULT nextval('public.authentication_events_id_seq'::regclass);


--
-- Name: closure_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests ALTER COLUMN id SET DEFAULT nextval('public.closure_requests_id_seq'::regclass);


--
-- Name: observation_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports ALTER COLUMN id SET DEFAULT nextval('public.observation_reports_id_seq'::regclass);


--
-- Name: patrols id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols ALTER COLUMN id SET DEFAULT nextval('public.patrols_id_seq'::regclass);


--
-- Name: plants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plants ALTER COLUMN id SET DEFAULT nextval('public.plants_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units ALTER COLUMN id SET DEFAULT nextval('public.units_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones ALTER COLUMN id SET DEFAULT nextval('public.zones_id_seq'::regclass);


--
-- Data for Name: authentication_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.authentication_events (id, user_id, username_attempted, event_type, success, ip_address, user_agent, event_timestamp) FROM stdin;
1	1	test.user	SIGNUP	t	127.0.0.1	curl/8.5.0	2026-09-14 07:33:23.996205+00
2	1	test.user@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-14 09:05:10.410651+00
3	2	test.auditee	SIGNUP	t	127.0.0.1	curl/8.5.0	2026-09-14 10:52:47.031184+00
4	3	test.ehs.officer	SIGNUP	t	127.0.0.1	curl/8.5.0	2026-09-14 10:53:34.784622+00
5	4	sparsh03	SIGNUP	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-14 10:57:35.304017+00
6	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-14 11:10:17.438485+00
7	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 03:20:03.369651+00
8	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 05:19:34.29158+00
9	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 05:34:00.465193+00
10	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 05:34:35.335438+00
11	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 09:07:08.038965+00
12	\N	test.ehsofficer@example.com	LOGIN_FAILURE	f	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 09:59:44.456758+00
13	3	test.ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:00:34.994675+00
14	3	test.ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:05:48.964843+00
15	10	ehs.officer	SIGNUP	t	127.0.0.1	curl/8.5.0	2026-09-15 10:37:33.61102+00
16	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:37:55.770752+00
17	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:38:32.396427+00
18	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:58:22.941684+00
19	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 10:59:08.57736+00
20	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 11:11:04.686599+00
21	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 11:16:00.723571+00
22	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 11:16:38.055454+00
23	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 11:18:34.378817+00
24	3	test.ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:03:05.293304+00
25	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:04:30.785494+00
26	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:07:46.252168+00
27	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:12:24.921715+00
28	5	test.auditor@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:15:21.067247+00
29	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:16:14.17857+00
30	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:20:11.429496+00
31	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-15 12:21:56.057887+00
32	2	test.auditee@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-16 03:04:39.76508+00
33	10	ehs.officer@example.com	LOGIN	t	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0	2026-09-16 03:21:55.688705+00
\.


--
-- Data for Name: closure_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.closure_requests (id, observation_report_id, patrol_id, requested_by, proposed_closure_date, action_plan, status, requested_at, reviewed_by, reviewed_at, review_comments, closed_at, created_at, updated_at, responsible_hod_name, target_date, completion_date, action_plan_saved_at, submitted_for_closure_at, approval_iteration, approved_at) FROM stdin;
2	2	8	2	2026-09-14	Install additional pedestrian crossing signs and conduct a documented safety briefing for the work area.	APPROVED	2026-09-12 11:09:09.985775+00	3	2026-09-13 11:09:09.985775+00	Corrective action verified and accepted.	2026-09-13 11:09:09.985775+00	2026-09-12 11:09:09.985775+00	2026-09-13 11:09:09.985775+00	\N	\N	\N	\N	\N	0	\N
3	10	6	2	\N	This is a test!	SUBMITTED_FOR_CLOSURE	2026-09-15 05:34:20.823207+00	\N	\N	\N	\N	2026-09-15 05:34:20.823207+00	2026-09-15 09:25:42.126087+00	Dinesh	2026-09-17	2026-09-15	2026-09-15 06:08:34.250482+00	2026-09-15 09:25:42.126087+00	0	\N
1	1	7	2	2026-09-21	The testing	SUBMITTED_FOR_CLOSURE	2026-09-14 10:39:09.985775+00	\N	\N	\N	\N	2026-09-14 10:39:09.985775+00	2026-09-15 09:27:48.578479+00	Dinesh	2026-09-16	2026-09-15	2026-09-15 09:27:46.046352+00	2026-09-15 09:27:48.578479+00	0	\N
\.


--
-- Data for Name: observation_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.observation_reports (id, patrol_id, submitted_by, submitted_to, status, submitted_at, updated_at, report_number, finding_date, plant_location, observation_location, category, photograph_path, photograph_original_name, photograph_mime_type, photograph_size, description, risk_category, closed_at) FROM stdin;
2	8	5	2	CLOSED	2026-09-12 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	TEST-POR-CLOSED	2026-09-18	Gurugram	Warehouse and dispatch area	UA	uploads/observations/test-closed.jpg	test-closed.jpg	image/jpeg	2048	An employee entered the material movement lane without using the designated pedestrian crossing.	MEDIUM	2026-09-14 11:09:09.985775+00
3	11	5	2	CLOSED	2026-02-07 02:00:00+00	2026-02-09 00:00:00+00	TEST-POR-ANNUAL-11	2026-02-07	Gurugram	ETP and chemical storage area	UC	uploads/observations/test-annual.png	test-annual.png	image/png	1024	Test observation report used for current-year dashboard metrics.	LOW	2026-02-09 00:00:00+00
4	12	5	2	CLOSED	2026-03-07 02:00:00+00	2026-03-09 00:00:00+00	TEST-POR-ANNUAL-12	2026-03-07	Gurugram	ETP and chemical storage area	UC	uploads/observations/test-annual.png	test-annual.png	image/png	1024	Test observation report used for current-year dashboard metrics.	LOW	2026-03-09 00:00:00+00
5	13	5	2	CLOSED	2026-04-07 02:00:00+00	2026-04-09 00:00:00+00	TEST-POR-ANNUAL-13	2026-04-07	Gurugram	ETP and chemical storage area	UC	uploads/observations/test-annual.png	test-annual.png	image/png	1024	Test observation report used for current-year dashboard metrics.	LOW	2026-04-09 00:00:00+00
10	6	5	2	PENDING_EHS_APPROVAL	2026-09-15 05:34:20.823207+00	2026-09-15 09:25:42.126087+00	POR-2026-000010	2026-09-15	Gurugram	Assembly line and material movement area	UC	/home/devadm/EHS/backend/uploads/observations/6360a6d3-377c-49ad-b06c-a51972a67cf6.png	Screenshot_2026-09-15_10-01-53.png	image/png	69300	Testing the application	MEDIUM	\N
1	7	5	2	PENDING_EHS_APPROVAL	2026-09-14 10:09:09.985775+00	2026-09-15 09:27:48.578479+00	TEST-POR-IN-PROGRESS	2026-09-17	Gurugram	Utility area and electrical panel section	UC	uploads/observations/test-in-progress.png	test-in-progress.png	image/png	1024	Temporary material was stored in front of the emergency electrical panel, reducing safe access to the panel.	HIGH	\N
\.


--
-- Data for Name: patrols; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.patrols (id, unit_id, zone_id, auditor_id, auditee_id, scheduled_date, status, created_by, created_at, updated_at, ehs_officer_id, plant_location, area_detail) FROM stdin;
2	2	2	5	2	2026-08-17	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
3	2	2	5	2	2026-08-24	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
4	2	2	5	2	2026-08-31	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
5	2	2	5	2	2026-09-07	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
8	2	4	5	2	2026-09-18	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
9	3	5	5	2	2026-09-19	SCHEDULED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
10	3	5	5	2	2026-10-05	SCHEDULED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
11	3	5	5	2	2026-02-07	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
12	3	5	5	2	2026-03-07	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
13	3	5	5	2	2026-04-07	COMPLETED	3	2026-09-14 11:09:09.985775+00	2026-09-14 11:09:09.985775+00	3	\N	\N
6	2	2	5	2	2026-09-16	PENDING_EHS_APPROVAL	3	2026-09-14 11:09:09.985775+00	2026-09-15 09:25:42.126087+00	3	\N	\N
7	2	3	5	2	2026-09-17	PENDING_EHS_APPROVAL	3	2026-09-14 11:09:09.985775+00	2026-09-15 09:27:48.578479+00	3	\N	\N
14	2	2	5	2	2026-09-21	SCHEDULED	10	2026-09-15 11:14:45.20709+00	2026-09-15 11:14:45.20709+00	10	Gurugram	Forge Shop
15	2	2	5	2	2026-09-22	SCHEDULED	10	2026-09-15 11:15:30.900406+00	2026-09-15 11:15:30.900406+00	10	Gurugram	ETP area
16	2	3	5	2	2026-09-29	SCHEDULED	10	2026-09-15 12:21:24.012063+00	2026-09-15 12:21:24.012063+00	10	Gurugram	Maintenance Store
17	2	2	5	2	2026-09-30	SCHEDULED	10	2026-09-16 03:22:13.316339+00	2026-09-16 03:22:13.316339+00	10	Gurugram	Machine shop
\.


--
-- Data for Name: plants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plants (id, name, code, is_active, created_at) FROM stdin;
1	Gurugram	GGM	t	2026-09-14 10:40:22.857427+00
2	Gurugram	TEST-GGM	t	2026-09-14 11:09:09.985775+00
3	Pune	TEST-PUN	t	2026-09-14 11:09:09.985775+00
4	Chennai	TEST-CHE	t	2026-09-14 11:09:09.985775+00
5	Manesar	TEST-MAN	t	2026-09-14 11:09:09.985775+00
6	China	TEST-CHN	t	2026-09-14 11:09:09.985775+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, code, name, created_at) FROM stdin;
1	USER	Application User	2026-09-14 07:33:14.161961+00
2	EHS_OFFICER	EHS Officer	2026-09-14 07:33:14.161961+00
3	HOD	Head of Department	2026-09-14 07:33:14.161961+00
4	PLANT_HEAD	Plant Head	2026-09-14 07:33:14.161961+00
5	ADMIN	System Administrator	2026-09-14 07:33:14.161961+00
7	AUDITOR	Safety Auditor	2026-09-14 11:07:44.937887+00
8	AUDITEE	Audit Responsible Person	2026-09-14 11:07:44.937887+00
\.


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.units (id, plant_id, name, code, is_active, created_at, unit_number) FROM stdin;
1	1	Unit 1	UNIT-1	t	2026-09-14 10:40:34.068801+00	1
2	2	Test Unit 1	TEST-UNIT-1	t	2026-09-14 11:09:09.985775+00	1
3	2	Test Unit 2	TEST-UNIT-2	t	2026-09-14 11:09:09.985775+00	2
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (user_id, role_id, assigned_at) FROM stdin;
1	1	2026-09-14 07:33:23.996205+00
2	1	2026-09-14 10:52:47.031184+00
3	1	2026-09-14 10:53:34.784622+00
4	1	2026-09-14 10:57:35.304017+00
5	1	2026-09-14 11:07:44.937887+00
8	1	2026-09-14 11:07:44.937887+00
9	1	2026-09-14 11:07:44.937887+00
3	2	2026-09-14 11:07:44.937887+00
8	3	2026-09-14 11:07:44.937887+00
9	4	2026-09-14 11:07:44.937887+00
5	7	2026-09-14 11:07:44.937887+00
2	8	2026-09-14 11:07:44.937887+00
10	1	2026-09-15 10:37:33.61102+00
10	2	2026-09-15 10:38:18.414506+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, full_name, username, email, password_hash, authentication_source, is_active, failed_login_attempts, locked_until, last_login_at, created_at, updated_at) FROM stdin;
1	Test User	test.user	test.user@example.com	$2b$12$MWWOyWZKJezlv7Hk05ylaOXXQEurOksOw0fNeTtfQhpD9D1A3m/NC	LOCAL	t	0	\N	2026-09-14 09:05:10.406882+00	2026-09-14 07:33:23.996205+00	2026-09-14 09:05:10.406882+00
4	Sparsh Khurana	sparsh03	sparsh.khurana@sonacomstar.com	$2b$12$zjhsv8lUyYBSUGeBtUIR2eVPCzPkmUWMT62KVkhr47rMukamEUZu6	LOCAL	t	0	\N	\N	2026-09-14 10:57:35.304017+00	2026-09-14 10:57:35.304017+00
8	Test HOD	test.hod	test.hod@example.com	$2a$12$0uFTwkDRhzCwWF8b7ElIquqsU0pCPxDnOzeA37MY.400WQfb7VsCK	LOCAL	t	0	\N	\N	2026-09-14 11:07:44.937887+00	2026-09-14 11:07:44.937887+00
9	Test Plant Head	test.plant.head	test.plant.head@example.com	$2a$12$qVvWTMTePxLxW2Py4nHB6eUfzN185dX.6UUy6iJdUaXoOoCQCWXaW	LOCAL	t	0	\N	\N	2026-09-14 11:07:44.937887+00	2026-09-14 11:07:44.937887+00
3	Test EHS Officer	test.ehs.officer	test.ehs.officer@example.com	$2b$12$z1MmCmuQSg6WJy1VaU1IO.TWIHuoYJsz0w7ETgo2AXXiF4VSdJ9ke	LOCAL	t	0	\N	2026-09-15 12:03:05.290558+00	2026-09-14 10:53:34.784622+00	2026-09-15 12:03:05.290558+00
5	Test Auditor	test.auditor	test.auditor@example.com	$2a$12$YQQh1tJkwrGTobd/gWziTuxvQmGUlCiGojOW2oXgxLoyNOFisV2kS	LOCAL	t	0	\N	2026-09-15 12:15:21.064035+00	2026-09-14 11:07:44.937887+00	2026-09-15 12:15:21.064035+00
2	Test Auditee	test.auditee	test.auditee@example.com	$2b$12$ENdUYD7WCJHIk9M/1/apC.bUUm5aaUhu8neOHZQKXw0ncEGDzhl.2	LOCAL	t	0	\N	2026-09-16 03:04:39.762766+00	2026-09-14 10:52:47.031184+00	2026-09-16 03:04:39.762766+00
10	EHS Officer Name	ehs.officer	ehs.officer@example.com	$2b$12$qHPlVPpPs/Xo66srox0iauIow9EIyNMMwuc.jdBcQi847g1igvgyy	LOCAL	t	0	\N	2026-09-16 03:21:55.684309+00	2026-09-15 10:37:33.61102+00	2026-09-16 03:21:55.684309+00
\.


--
-- Data for Name: zones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.zones (id, unit_id, name, code, area_detail, is_active, created_at, zone_number) FROM stdin;
1	1	Zone 4	ZONE-4	ETP and Utility Area	t	2026-09-14 10:40:44.289135+00	4
2	2	Test Zone 1	TEST-ZONE-1	Assembly line and material movement area	t	2026-09-14 11:09:09.985775+00	1
3	2	Test Zone 2	TEST-ZONE-2	Utility area and electrical panel section	t	2026-09-14 11:09:09.985775+00	2
4	2	Test Zone 3	TEST-ZONE-3	Warehouse and dispatch area	t	2026-09-14 11:09:09.985775+00	3
5	3	Test Zone 4	TEST-ZONE-4	ETP and chemical storage area	t	2026-09-14 11:09:09.985775+00	4
\.


--
-- Name: authentication_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.authentication_events_id_seq', 33, true);


--
-- Name: closure_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.closure_requests_id_seq', 3, true);


--
-- Name: observation_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.observation_reports_id_seq', 10, true);


--
-- Name: patrols_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.patrols_id_seq', 17, true);


--
-- Name: plants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.plants_id_seq', 6, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 18, true);


--
-- Name: units_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.units_id_seq', 35, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 10, true);


--
-- Name: zones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.zones_id_seq', 6, true);


--
-- Name: authentication_events authentication_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_events
    ADD CONSTRAINT authentication_events_pkey PRIMARY KEY (id);


--
-- Name: closure_requests closure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests
    ADD CONSTRAINT closure_requests_pkey PRIMARY KEY (id);


--
-- Name: observation_reports observation_reports_patrol_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports
    ADD CONSTRAINT observation_reports_patrol_id_key UNIQUE (patrol_id);


--
-- Name: observation_reports observation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports
    ADD CONSTRAINT observation_reports_pkey PRIMARY KEY (id);


--
-- Name: patrols patrols_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_pkey PRIMARY KEY (id);


--
-- Name: plants plants_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plants
    ADD CONSTRAINT plants_code_key UNIQUE (code);


--
-- Name: plants plants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plants
    ADD CONSTRAINT plants_pkey PRIMARY KEY (id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: units units_plant_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_plant_code_unique UNIQUE (plant_id, code);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: zones zones_unit_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_unit_code_unique UNIQUE (unit_id, code);


--
-- Name: closure_requests_approval_queue_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_approval_queue_index ON public.closure_requests USING btree (status, submitted_for_closure_at);


--
-- Name: closure_requests_auditee_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_auditee_status_index ON public.closure_requests USING btree (requested_by, status);


--
-- Name: closure_requests_observation_report_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX closure_requests_observation_report_unique ON public.closure_requests USING btree (observation_report_id);


--
-- Name: closure_requests_patrol_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_patrol_index ON public.closure_requests USING btree (patrol_id);


--
-- Name: closure_requests_requested_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_requested_by_index ON public.closure_requests USING btree (requested_by, requested_at);


--
-- Name: closure_requests_reviewed_by_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_reviewed_by_index ON public.closure_requests USING btree (reviewed_by);


--
-- Name: closure_requests_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_status_index ON public.closure_requests USING btree (status);


--
-- Name: closure_requests_submitted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_submitted_at_index ON public.closure_requests USING btree (submitted_for_closure_at);


--
-- Name: closure_requests_target_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX closure_requests_target_date_index ON public.closure_requests USING btree (target_date);


--
-- Name: observation_reports_finding_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX observation_reports_finding_date_index ON public.observation_reports USING btree (finding_date);


--
-- Name: observation_reports_report_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX observation_reports_report_number_unique ON public.observation_reports USING btree (report_number) WHERE (report_number IS NOT NULL);


--
-- Name: observation_reports_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX observation_reports_status_index ON public.observation_reports USING btree (status);


--
-- Name: observation_reports_submitted_to_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX observation_reports_submitted_to_index ON public.observation_reports USING btree (submitted_to, status);


--
-- Name: patrols_auditee_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_auditee_date_index ON public.patrols USING btree (auditee_id, scheduled_date);


--
-- Name: patrols_auditee_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_auditee_scheduled_date_index ON public.patrols USING btree (auditee_id, scheduled_date);


--
-- Name: patrols_auditor_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_auditor_date_index ON public.patrols USING btree (auditor_id, scheduled_date);


--
-- Name: patrols_auditor_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_auditor_scheduled_date_index ON public.patrols USING btree (auditor_id, scheduled_date);


--
-- Name: patrols_ehs_officer_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_ehs_officer_id_index ON public.patrols USING btree (ehs_officer_id);


--
-- Name: patrols_ehs_officer_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_ehs_officer_index ON public.patrols USING btree (ehs_officer_id);


--
-- Name: patrols_ehs_officer_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_ehs_officer_scheduled_date_index ON public.patrols USING btree (ehs_officer_id, scheduled_date);


--
-- Name: patrols_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_scheduled_date_index ON public.patrols USING btree (scheduled_date);


--
-- Name: patrols_status_scheduled_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_status_scheduled_date_index ON public.patrols USING btree (status, scheduled_date);


--
-- Name: patrols_zone_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patrols_zone_date_index ON public.patrols USING btree (zone_id, scheduled_date);


--
-- Name: units_plant_unit_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX units_plant_unit_number_index ON public.units USING btree (plant_id, unit_number);


--
-- Name: users_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_unique ON public.users USING btree (lower((email)::text));


--
-- Name: users_username_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_lower_unique ON public.users USING btree (lower((username)::text));


--
-- Name: zones_unit_zone_number_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zones_unit_zone_number_index ON public.zones USING btree (unit_id, zone_number);


--
-- Name: authentication_events authentication_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authentication_events
    ADD CONSTRAINT authentication_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: closure_requests closure_requests_observation_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests
    ADD CONSTRAINT closure_requests_observation_report_id_fkey FOREIGN KEY (observation_report_id) REFERENCES public.observation_reports(id) ON DELETE CASCADE;


--
-- Name: closure_requests closure_requests_patrol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests
    ADD CONSTRAINT closure_requests_patrol_id_fkey FOREIGN KEY (patrol_id) REFERENCES public.patrols(id) ON DELETE CASCADE;


--
-- Name: closure_requests closure_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests
    ADD CONSTRAINT closure_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: closure_requests closure_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.closure_requests
    ADD CONSTRAINT closure_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: observation_reports observation_reports_patrol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports
    ADD CONSTRAINT observation_reports_patrol_id_fkey FOREIGN KEY (patrol_id) REFERENCES public.patrols(id) ON DELETE CASCADE;


--
-- Name: observation_reports observation_reports_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports
    ADD CONSTRAINT observation_reports_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: observation_reports observation_reports_submitted_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_reports
    ADD CONSTRAINT observation_reports_submitted_to_fkey FOREIGN KEY (submitted_to) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: patrols patrols_auditee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_auditee_id_fkey FOREIGN KEY (auditee_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: patrols patrols_auditor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: patrols patrols_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: patrols patrols_ehs_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_ehs_officer_id_fkey FOREIGN KEY (ehs_officer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: patrols patrols_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: patrols patrols_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE RESTRICT;


--
-- Name: units units_plant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zones zones_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict QJ4KXWrJvEbsjovTRL90ydJBjMeY1aDMGkiTUs6GRWUe90ih3hndSv3FfFKLmAt

